
def get_alive_players(players):
    return [player for player in players if player.alive]


def get_laser_path(start, target):
    # Find the grid cells the laser passes through
    x1, y1 = start
    x2, y2 = target

    path = []

    dx = abs(x2 - x1)
    dy = abs(y2 - y1)

    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1

    error = dx - dy

    while True:
        path.append((x1, y1))

        if (x1, y1) == (x2, y2):
            break

        double_error = 2 * error

        if double_error > -dy:
            error -= dy
            x1 += sx

        if double_error < dx:
            error += dx
            y1 += sy

    return path


def get_players_hit(players):
    # Check which players are hit by the lasers
    players_hit = set()

    for shooter in players:
        if not shooter.alive or shooter.laser_target is None:
            continue

        # Find all grid cells along the laser's path
        laser_path = get_laser_path(
            shooter.position,
            shooter.laser_target
        )

        for target_player in players:

            # A player cannot hit themselves
            if shooter == target_player or not target_player.alive:
                continue

            # Check whether the player's position is along the laser path
            if target_player.position in laser_path:
                players_hit.add(target_player)

    return players_hit


def eliminate_players(players_hit):
    # Eliminate players only after checking all lasers
    for player in players_hit:
        player.alive = False


def get_winner(players):
    alive_players = get_alive_players(players)

    if len(alive_players) == 1:
        return alive_players[0]

    return None
