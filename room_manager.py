import random
import threading

from constants import ROOM_CODE_CHARS, ROOM_CODE_LENGTH
from game_manager import GameManager


class RoomManager:
    """Keeps track of every open room and which room each browser is in."""

    def __init__(self):
        self.games = {}           # room code -> GameManager
        self.sid_to_code = {}     # socket id -> room code
        self.lock = threading.Lock()

    def create_room(self):
        with self.lock:
            code = self._new_code()
            game = GameManager(code)
            self.games[code] = game
            return game

    def _new_code(self):
        while True:
            code = "".join(random.choice(ROOM_CODE_CHARS) for _ in range(ROOM_CODE_LENGTH))
            if code not in self.games:
                return code

    def get(self, code):
        return self.games.get(code)

    def attach(self, sid, code):
        with self.lock:
            self.sid_to_code[sid] = code

    def game_for(self, sid):
        code = self.sid_to_code.get(sid)
        return self.games.get(code) if code else None

    def detach(self, sid):
        # forget this browser and return the game it was in (or None)
        with self.lock:
            code = self.sid_to_code.pop(sid, None)
            return self.games.get(code) if code else None

    def delete_if_empty(self, game):
        with self.lock:
            if game.is_empty():
                self.games.pop(game.code, None)
