import math
import random  # gives python access to random number generation functions

#contains the game's settings, like arena dimensions and spawn spacing.
from constants import (
    ARENA_W, ARENA_H, SPAWN_MARGIN, SPAWN_MIN_DISTANCE, JITTER, EDGE_MARGIN
)


class Player:
    def __init__(self, sid, name, slot):
        self.sid = sid              # socket id of this player's browser
        self.name = name
        self.slot = slot            # 0, 1, 2... decides the player's colour
        self.position = None        # (x, y) in arena units, none because the player hasn't been assigned a position or submitted a target yet.
        self.alive = True
        self.laser_target = None    # (x, y) the player clicked; stays secret until the reveal
        self.wins = 0               # matches won


def generate_positions(count):
    # random spots across the whole arena, kept apart from each other
    positions = []
    min_distance = SPAWN_MIN_DISTANCE

    while len(positions) < count:
        for _ in range(200):
            x = random.uniform(SPAWN_MARGIN, ARENA_W - SPAWN_MARGIN)
            y = random.uniform(SPAWN_MARGIN, ARENA_H - SPAWN_MARGIN)

            if all(math.hypot(x - px, y - py) >= min_distance for px, py in positions):  
                positions.append((round(x, 1), round(y, 1)))
                break
        else:
            # arena too crowded for that spacing: relax it and try again
            min_distance *= 0.8

    return positions


def jitter_position(position):
    # nudge a player a little, but keep them inside the walls
    x = min(max(position[0] + random.uniform(-JITTER, JITTER), EDGE_MARGIN), ARENA_W - EDGE_MARGIN)
    y = min(max(position[1] + random.uniform(-JITTER, JITTER), EDGE_MARGIN), ARENA_H - EDGE_MARGIN)
    return (round(x, 1), round(y, 1))