import math
import random

from constants import HIT_RADIUS, MIN_AIM_DISTANCE, EDGE_MARGIN

EPS = 1e-6   # tolerance for the decimals the browser sends back


def get_alive_players(players):
    return [player for player in players if player.alive]


def random_position(arena):
    # a random legal spot inside the arena, used when a player runs out of time while placing
    x0, y0, x1, y1 = arena
    x = random.uniform(x0 + EDGE_MARGIN, x1 - EDGE_MARGIN)
    y = random.uniform(y0 + EDGE_MARGIN, y1 - EDGE_MARGIN)
    return (round(x, 1), round(y, 1))


def validate_position(x, y, arena):
    # where a player wants to stand. the browser can't be trusted, so check it.
    # returns (position, error_message); exactly one of them is None
    try:
        x = float(x)
        y = float(y)
    except (TypeError, ValueError):
        return None, "That spot is not a valid point."

    if not (math.isfinite(x) and math.isfinite(y)):
        return None, "That spot is not a valid point."

    x0, y0, x1, y1 = arena
    m = EDGE_MARGIN
    if not (x0 + m - EPS <= x <= x1 - m + EPS and y0 + m - EPS <= y <= y1 - m + EPS):
        return None, "Stay inside the glowing area."

    return (round(x, 1), round(y, 1)), None


def validate_target(shooter, x, y, arena):
    # the browser can't be trusted, so check what it sent.
    # returns (target, error_message); exactly one of them is None
    try:
        x = float(x)
        y = float(y)
    except (TypeError, ValueError):
        return None, "That target is not a valid point."

    if not (math.isfinite(x) and math.isfinite(y)):
        return None, "That target is not a valid point."

    x0, y0, x1, y1 = arena
    if not (x0 - EPS <= x <= x1 + EPS and y0 - EPS <= y <= y1 + EPS):
        return None, "Aim inside the glowing area."

    if math.hypot(x - shooter.position[0], y - shooter.position[1]) < MIN_AIM_DISTANCE:
        return None, "Aim a bit further away from yourself."

    return (x, y), None


def laser_hits(shooter, target):
    # the laser is a short beam: it starts at the shooter and stops at the clicked point.
    # it only hits someone standing on that line, between the shooter and the point.
    dx = shooter.laser_target[0] - shooter.position[0]
    dy = shooter.laser_target[1] - shooter.position[1]
    length = math.hypot(dx, dy)

    if length == 0:
        return False

    dx, dy = dx / length, dy / length

    vx = target.position[0] - shooter.position[0]
    vy = target.position[1] - shooter.position[1]

    # closest point on the beam to the target, clamped to the beam's two ends
    along = max(0, min(length, vx * dx + vy * dy))

    # distance from the target's centre to that closest point
    return math.hypot(vx - dx * along, vy - dy * along) <= HIT_RADIUS


def get_players_hit(players):
    # checking who got hit
    players_hit = set()

    for shooter in players:
        if not shooter.alive or shooter.laser_target is None:
            continue

        for target_player in players:

            # a player cannot hit themselves
            if shooter != target_player and target_player.alive:

                if laser_hits(shooter, target_player):
                    players_hit.add(target_player)

    return players_hit


def eliminate_players(players_hit):
    # eliminate players only after checking all lasers
    for player in players_hit:
        player.alive = False


def get_winner(players):
    alive_players = get_alive_players(players)

    if len(alive_players) == 1:
        return alive_players[0]

    return None
