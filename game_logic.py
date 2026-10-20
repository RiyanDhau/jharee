def get_alive_players(players):
    return [player for player in players if player.alive]


def get_players_hit(players):
    # checking who got hit
    players_hit = set()

    for shooter in players:
        if not shooter.alive:
            continue

        for target_player in players:

            # a player cannot hit themselves
            if shooter != target_player and target_player.alive:

                # check whether the laser hits another player
                if shooter.laser_target == target_player.position:
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