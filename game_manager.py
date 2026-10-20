
from player import Player, generate_position, MAP_SIZE
from game_logic import (
    get_alive_players,
    get_players_hit,
    eliminate_players,
    get_winner
)


def get_coordinate(axis):
    while True:
        try:
            coordinate = int(input(f"Enter target {axis} (0-9): "))

            if 0 <= coordinate < MAP_SIZE:
                return coordinate
            else:
                print("Invalid coordinate! Enter a number from 0 to 9.")

        except ValueError:
            print("Invalid input! Please enter a whole number.")


def start_game():
    # inputing the number of players
    while True:
        try:
            num_players = int(input("How many players are playing? "))

            if 2 <= num_players <= MAP_SIZE * MAP_SIZE:
                break
            else:
                print(f"Enter a number between 2 and {MAP_SIZE * MAP_SIZE}!")

        except ValueError:
            print("Invalid input! Please enter a whole number.")

    # inputing the number of rounds
    while True:
        try:
            max_rounds = int(input("How many rounds do you want to play? "))

            if max_rounds >= 1:
                break
            else:
                print("You need to play at least 1 round!")

        except ValueError:
            print("Invalid input! Please enter a whole number.")

    players = []  # empty list to hold player objects
    occupied_positions = set()  # track occupied positions

    # create players and assign unique random positions
    for i in range(num_players):
        name = input(f"Enter Player {i + 1}'s name: ")

        position = generate_position()

        while position in occupied_positions:
            position = generate_position()

        occupied_positions.add(position)

        player = Player(name, position)
        players.append(player)

    print("\n--- GAME START ---")

    for player in players:
        print(f"{player.name} spawned at {player.position}")

    print(f"\n{len(players)} players have joined!")
    print(f"The game will last up to {max_rounds} rounds.")

    round_number = 1

    # repeat the game until the chosen rounds are completed
    while round_number <= max_rounds:

        # check how many players are still alive
        alive_players = get_alive_players(players)

        # stop if there are no players left
        if len(alive_players) == 0:
            print("\nEveryone got eliminated! Nobody wins!")
            break

        # stop if only one player remains
        if len(alive_players) == 1:
            winner = get_winner(players)
            print(f"\n🏆 {winner.name} is the winner!")
            break

        print(f"\n========== ROUND {round_number} ==========")

        # reset laser targets before each new round
        for player in players:
            player.laser_target = None

        # each living player chooses where their laser is aiming
        print("\n--- LASER AIMING ---")

        for player in alive_players:
            print(f"\n{player.name}, choose your laser target!")

            # inputing x coordinate
            x = get_coordinate("X")

            # inputing y coordinate
            y = get_coordinate("Y")

            # storing both coordinates as a tuple
            player.laser_target = (x, y)

            print(f"{player.name}'s target is locked in!")

        print("\nAll lasers aimed! Targets are locked in.")

        # check who got hit before eliminating anyone
        players_hit = get_players_hit(alive_players)

        # eliminate players only after checking all lasers
        eliminate_players(players_hit)

        # print the results
        print("\n--- RESULTS ---")

        for player in players:
            if player in players_hit:
                print(f"{player.name} got eliminated!")
            elif player.alive:
                print(f"{player.name} survived!")
            else:
                print(f"{player.name} was already eliminated!")

        # move to the next round
        round_number += 1

    # display the final outcome after the chosen rounds
    alive_players = get_alive_players(players)

    print("\n========== FINAL RESULTS ==========")

    if len(alive_players) == 1:
        print(f"🏆 {alive_players[0].name} is the winner!")
    elif len(alive_players) == 0:
        print("Everyone got eliminated! Nobody wins!")
    else:
        print("The chosen number of rounds is over!")
        print("Players who survived:")

        for player in alive_players:
            print(f"- {player.name}")


if __name__ == "__main__":
    start_game()
