from flask import request
from flask_socketio import emit, join_room, leave_room

from constants import MAX_NAME_LENGTH, PLACE_SECONDS, AIM_SECONDS


def clean_name(raw, fallback):
    name = str(raw or "").strip()[:MAX_NAME_LENGTH]
    return name or fallback


def register_socket_events(socketio, rooms):
    # ---------- helpers ----------
    def send_lobby(game):
        # who is in the room and who has clicked READY
        socketio.emit("lobby_update", game.lobby_state(), to=game.code)

    def send_counts(game):
        # tell everyone how many have placed and fired, never where anyone is or aims
        placed, fired, total = game.lock_counts()
        socketio.emit("lock_count", {"placed": placed, "fired": fired, "total": total}, to=game.code)

    def announce_round(game):
        # each player gets a private message with no positions in it
        for player in game.players:
            socketio.emit("round_start", game.round_state_for(player), to=player.sid)

        # two time limits run from the start of the round
        after(PLACE_SECONDS, game, game.phase_id, place_timeout)
        after(PLACE_SECONDS + AIM_SECONDS, game, game.phase_id, round_timeout)

    def run_action(game, action):
        # "start" = the game just began, "advance" = everyone is ready for the next round
        if action == "start":
            announce_round(game)
        elif action == "advance":
            game.start_round()
            announce_round(game)

    def enter_room(game, name):
        player = game.add_player(request.sid, name)
        if player is None:
            emit("error_msg", {"message": "That game already started. Create a new room!"})
            return

        rooms.attach(request.sid, game.code)
        join_room(game.code)
        emit("room_joined", {"code": game.code, "slot": player.slot})
        send_lobby(game)

    # ---------- timers ----------
    def after(seconds, game, phase_id, action):
        # run `action` once the time is up (it does nothing if the game has moved on by then)
        def wait_then_act():
            socketio.sleep(seconds)
            action(game, phase_id)

        socketio.start_background_task(wait_then_act)

    def place_timeout(game, phase_id):
        assigned = game.force_place(phase_id)
        if not assigned:
            return

        # tell each player who got a random spot where they ended up (privately)
        for player, position in assigned:
            socketio.emit("position_assigned", {"x": position[0], "y": position[1]}, to=player.sid)

        send_counts(game)

    def round_timeout(game, phase_id):
        result = game.force_resolve(phase_id)
        if result is not None:
            socketio.emit("reveal", result, to=game.code)

    # ---------- lobby ----------
    @socketio.on("create_room")
    def on_create_room(data):
        data = data or {}

        if rooms.game_for(request.sid):
            emit("error_msg", {"message": "You are already in a room."})
            return

        game = rooms.create_room()
        enter_room(game, clean_name(data.get("name"), "Player 1"))

    @socketio.on("join_game")
    def on_join_game(data):
        data = data or {}

        if rooms.game_for(request.sid):
            emit("error_msg", {"message": "You are already in a room."})
            return

        code = str(data.get("code", "")).strip().upper()
        game = rooms.get(code)

        if game is None:
            emit("error_msg", {"message": "Room not found. Check the code."})
            return

        enter_room(game, clean_name(data.get("name"), f"Player {len(game.players) + 1}"))

    @socketio.on("toggle_ready")
    def on_toggle_ready():
        game = rooms.game_for(request.sid)
        if game is None:
            return

        action = game.toggle_ready(request.sid)
        if action is None:
            send_lobby(game)      # just update the ready signs
        else:
            run_action(game, action)

    # ---------- gameplay ----------
    @socketio.on("submit_position")
    def on_submit_position(data):
        game = rooms.game_for(request.sid)
        if game is None:
            return

        data = data or {}
        ok, error = game.submit_position(request.sid, data.get("x"), data.get("y"))

        if not ok:
            emit("error_msg", {"message": error})
            return

        # you can aim straight away: you don't wait for anyone else
        emit("position_locked", {})
        send_counts(game)

    @socketio.on("submit_target")
    def on_submit_target(data):
        game = rooms.game_for(request.sid)
        if game is None:
            return

        data = data or {}
        ok, error, result = game.submit_target(request.sid, data.get("x"), data.get("y"))

        if not ok:
            emit("error_msg", {"message": error})
            return

        emit("target_locked", {})

        # everyone fired: send the reveal to the whole room
        if result is not None:
            socketio.emit("reveal", result, to=game.code)
        else:
            send_counts(game)

    # ---------- leaving ----------
    @socketio.on("disconnect")
    def on_disconnect(*args):
        game = rooms.detach(request.sid)
        if game is None:
            return

        leave_room(game.code)
        result, action, over = game.remove_player(request.sid)

        if game.is_empty():
            rooms.delete_if_empty(game)
            return

        socketio.emit("player_left", {}, to=game.code)
        send_lobby(game)

        if result is not None:
            socketio.emit("reveal", result, to=game.code)
        elif over is not None:
            socketio.emit("game_over", over, to=game.code)
        elif action is not None:
            run_action(game, action)
        elif game.phase == "playing":
            send_counts(game)