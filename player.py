class Player:
    def __init__(self, sid, name, slot):
        self.sid = sid              # socket id of this player's browser
        self.name = name
        self.slot = slot            # 0, 1, 2... decides the player's colour
        self.position = None        # (x, y): where the player clicked to stand this round
        self.alive = True           # once you get shot you are out for the rest of the game
        self.laser_target = None    # (x, y) the player clicked to aim at; secret until the reveal