import threading

from constants import (
    PLACE_SECONDS, AIM_SECONDS, MIN_PLAYERS, MAX_PLAYERS,
    ARENA_W, ARENA_H, SHRINK_FACTOR, MIN_ARENA_SCALE,
)
from player import Player
from game_logic import (
    get_alive_players,
    get_players_hit,
    eliminate_players,
    get_winner,
    random_position,
    validate_position,
    validate_target,
)


class GameManager:
    """One game (one room). It holds the secret positions and targets and decides who gets hit.

    LOBBY: anyone can join. Everyone clicks READY and the game starts when all are ready.
    THE GAME is played in rounds. In every round each player does two secret things, at their own pace:
      1. click where to stand
      2. point the laser and fire (nobody has to wait for the others to place first)
    Once everyone has fired (or time runs out) everything is revealed at once.
    You are out the moment you get shot. If a round passes with nobody hit, the arena shrinks.
    After each round the survivors click READY for the next one.
    The game ends when one player (or nobody) is left. There are no scores: just a winner.
    """

    def __init__(self, code):
        self.code = code
        self.players = []
        self.phase = "waiting"        # waiting -> playing -> reveal -> playing ... -> over
        self.phase_id = 0             # changes on every phase change so old timers know they are stale
        self.round_number = 0
        self.shrink_level = 0         # how many rounds in a row passed with nobody hit
        self.ready = set()            # sids that clicked READY
        self.lock = threading.RLock() # several players can act at the same moment

    def _set_phase(self, phase):
        self.phase = phase
        self.phase_id += 1

    # ---------- the arena ----------
    def arena(self):
        # the playable area (x0, y0, x1, y1), centred, getting smaller every time nobody gets hit
        scale = max(MIN_ARENA_SCALE, SHRINK_FACTOR ** self.shrink_level)
        w, h = ARENA_W * scale, ARENA_H * scale
        x0, y0 = (ARENA_W - w) / 2, (ARENA_H - h) / 2
        return (round(x0, 1), round(y0, 1), round(x0 + w, 1), round(y0 + h, 1))

    # ---------- players ----------
    def is_full(self):
        return len(self.players) >= MAX_PLAYERS

    def is_empty(self):
        return len(self.players) == 0

    def accepting_players(self):
        # people can only join while the room is still in the lobby
        return self.phase == "waiting" and not self.is_full()

    def get_player(self, sid):
        for player in self.players:
            if player.sid == sid:
                return player
        return None

    def add_player(self, sid, name):
        with self.lock:
            if not self.accepting_players():
                return None

            taken = {player.slot for player in self.players}
            slot = 0
            while slot in taken:
                slot += 1

            player = Player(sid, name, slot)
            self.players.append(player)
            self.players.sort(key=lambda p: p.slot)
            return player

    def _lobby_ready(self):
        return len(self.players) >= MIN_PLAYERS and all(p.sid in self.ready for p in self.players)

    def _end_game(self):
        # the game is over: the last player alive (if any) wins
        alive = get_alive_players(self.players)
        winner = alive[0] if len(alive) == 1 else None
        self._set_phase("over")
        return {
            "winner": winner.slot if winner else None,
            "winner_name": winner.name if winner else None,
        }

    def reset_to_lobby(self, phase_id):
        # after a finished game everyone goes back to the waiting room together.
        # returns False if this timer is stale
        with self.lock:
            if self.phase != "over" or phase_id != self.phase_id:
                return False

            for player in self.players:
                player.alive = True
                player.position = None
                player.laser_target = None

            self.ready.clear()
            self.round_number = 0
            self.shrink_level = 0
            self._set_phase("waiting")
            return True

    def remove_player(self, sid):
        # returns (result, action, over):
        #   result: a round result to reveal right now, or None
        #   action: "start" or "advance" when the next round should begin right now, or None
        #   over:   the winner info when the game just ended because people left, or None
        with self.lock:
            leaver = self.get_player(sid)
            was_alive = leaver is not None and leaver.alive

            self.players = [p for p in self.players if p.sid != sid]
            self.ready.discard(sid)

            if self.phase == "waiting":
                # everyone who is left may already be ready
                if self._lobby_ready():
                    self.start_match()
                    self.start_round()
                    return None, "start", None
                return None, None, None

            if self.phase == "over":
                return None, None, None

            # a game is running
            if len(self.players) < MIN_PLAYERS:
                return None, None, self._end_game()

            if self.phase == "playing":
                if was_alive:
                    # the round may be finished now that this player is gone
                    _, fired, total = self.lock_counts()
                    if total <= 1 or fired == total:
                        return self.force_resolve(self.phase_id), None, None
                return None, None, None

            if self.phase == "reveal":
                if len(get_alive_players(self.players)) <= 1:
                    return None, None, self._end_game()
                return None, ("advance" if self.check_advance() else None), None

            return None, None, None

    # ---------- ready ----------
    def toggle_ready(self, sid):
        # returns "start" (the game begins), "advance" (the next round begins) or None
        with self.lock:
            player = self.get_player(sid)
            if player is None:
                return None

            if self.phase == "waiting":
                if sid in self.ready:
                    self.ready.discard(sid)
                else:
                    self.ready.add(sid)

                if self._lobby_ready():
                    self.start_match()
                    self.start_round()
                    return "start"
                return None

            if self.phase == "reveal":
                if not player.alive:
                    return None   # knocked-out players don't need to click

                self.ready.add(sid)
                return "advance" if self.check_advance() else None

            return None

    def check_advance(self):
        # returns True (once) when every survivor is ready for the next round
        with self.lock:
            alive = get_alive_players(self.players)
            if self.phase == "reveal" and alive and all(p.sid in self.ready for p in alive):
                self._set_phase("starting")   # stops a double click from advancing twice
                return True
            return False

    # ---------- the game and its rounds ----------
    def start_match(self):
        with self.lock:
            for player in self.players:
                player.alive = True
                player.position = None
                player.laser_target = None

            self.round_number = 0
            self.shrink_level = 0

    def start_round(self):
        with self.lock:
            self.round_number += 1
            self.ready.clear()

            # nobody has a position or a target yet
            for player in self.players:
                player.position = None
                player.laser_target = None

            self._set_phase("playing")

    def round_state_for(self, player):
        # no positions in here: nobody knows where anyone stands until the reveal
        return {
            "round": self.round_number,
            "slot": player.slot,
            "alive": player.alive,
            "alive_count": len(get_alive_players(self.players)),
            "alive_slots": [p.slot for p in get_alive_players(self.players)],
            "ready_slots": [],
            "arena": list(self.arena()),
            "place_seconds": PLACE_SECONDS,
            "round_seconds": PLACE_SECONDS + AIM_SECONDS,
        }

    def lobby_state(self):
        return {
            "code": self.code,
            "phase": self.phase,
            "players": [{"name": p.name, "slot": p.slot} for p in self.players],
            "ready_slots": [p.slot for p in self.players if p.sid in self.ready],
        }

    # ---------- placing and aiming (each player at their own pace) ----------
    def lock_counts(self):
        # how many alive players have placed and how many have fired
        alive = get_alive_players(self.players)
        placed = sum(1 for p in alive if p.position is not None)
        fired = sum(1 for p in alive if p.laser_target is not None)
        return placed, fired, len(alive)

    def submit_position(self, sid, x, y):
        # returns (ok, error)
        with self.lock:
            if self.phase != "playing":
                return False, "You can't place yourself right now."

            player = self.get_player(sid)
            if player is None:
                return False, "You are not in this room."

            if not player.alive:
                return False, "You are out of this game."

            # clicking again simply moves you, until the moment you fire
            if player.laser_target is not None:
                return False, "You already fired, so you can't move."

            position, error = validate_position(x, y, self.arena())
            if error:
                return False, error

            player.position = position
            return True, None

    def submit_target(self, sid, x, y):
        # returns (ok, error, result). result is only set for the call that finishes the round.
        with self.lock:
            if self.phase != "playing":
                return False, "You can't aim right now.", None

            player = self.get_player(sid)
            if player is None:
                return False, "You are not in this room.", None

            if not player.alive:
                return False, "You are out of this game.", None

            if player.position is None:
                return False, "Choose where to stand first.", None

            if player.laser_target is not None:
                return False, "You already fired.", None

            target, error = validate_target(player, x, y, self.arena())
            if error:
                return False, error, None

            player.laser_target = target

            _, fired, total = self.lock_counts()
            if fired == total:
                return True, None, self.resolve_round()

            return True, None, None

    # ---------- running out of time ----------
    def force_place(self, phase_id):
        # placing time is up: anyone who hasn't chosen a spot gets a random one.
        # returns the list of (player, position) that were assigned, or None if this timer is stale
        with self.lock:
            if self.phase != "playing" or phase_id != self.phase_id:
                return None

            assigned = []
            for player in get_alive_players(self.players):
                if player.position is None:
                    player.position = random_position(self.arena())
                    assigned.append((player, player.position))

            return assigned

    def force_resolve(self, phase_id):
        # the round's time is up: anyone who hasn't fired doesn't shoot this round.
        # returns the round result, or None if this timer is stale
        with self.lock:
            if self.phase != "playing" or phase_id != self.phase_id:
                return None

            for player in get_alive_players(self.players):
                if player.position is None:
                    player.position = random_position(self.arena())
                if player.laser_target is None:
                    player.laser_target = player.position   # a zero-length laser hits nobody

            return self.resolve_round()

    def resolve_round(self):
        # check every laser first, then eliminate (so players can hit each other)
        alive_before = get_alive_players(self.players)
        players_hit = get_players_hit(alive_before)
        eliminate_players(players_hit)

        alive_after = get_alive_players(self.players)
        game_over = len(alive_after) <= 1

        # nobody got hit and the game goes on: the room gets smaller
        shrinking = (not players_hit) and (not game_over)
        if shrinking:
            self.shrink_level += 1

        winner = get_winner(self.players) if game_over else None
        self._set_phase("over" if game_over else "reveal")

        # now the secret positions and targets become public
        return {
            "round": self.round_number,
            "match_over": game_over,
            "winner": winner.slot if winner else None,
            "winner_name": winner.name if winner else None,
            "shrinking": shrinking,
            "alive_count": len(alive_after),
            "alive_slots": [p.slot for p in alive_after],
            "players": [
                {
                    "slot": p.slot,
                    "name": p.name,
                    "x": p.position[0],
                    "y": p.position[1],
                    "tx": p.laser_target[0],
                    "ty": p.laser_target[1],
                    "hit": p in players_hit,
                }
                for p in alive_before
            ],
        }
