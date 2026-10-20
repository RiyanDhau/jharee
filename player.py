
import random #gives python access to random number generation functions

#map size: 10 x 10
MAP_SIZE = 10

class Player:
    def __init__(self, name, position):
        self.name = name
        self.position = position
        self.alive = True
        self.laser_target = None  #stores where the player's laser is aiming

def generate_position():
    x = random.randint(0, MAP_SIZE - 1)
    y = random.randint(0, MAP_SIZE - 1)
    return (x, y)

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

#inputing the number of players
while True:
    try:
        num_players = int(input("How many players are playing? "))

        if num_players >= 2:
            break
        else:
            print("You need at least 2 players to play!")

    except ValueError:
        print("Invalid input! Please enter a whole number.")

players = []  #empty list to hold player objects
occupied_positions = set()  #empty set to track occupied positions

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

round_number = 1

#repeat the game until there is a winner or everyone is eliminated
while True:

    #check how many players are still alive
    alive_players = [player for player in players if player.alive]

    #stop if there are no players left
    if len(alive_players) == 0:
        print("\nEveryone got eliminated! Nobody wins!")
        break

    #stop if only one player remains
    if len(alive_players) == 1:
        print(f"\n🏆 {alive_players[0].name} is the winner!")
        break

    print(f"\n========== ROUND {round_number} ==========")

    #reset laser targets before each new round
    for player in players:
        player.laser_target = None

    #each player chooses where their laser is aiming
    print("\n--- LASER AIMING ---")

    for player in players:

        #skip players who have been eliminated
        if not player.alive:
            continue

        print(f"\n{player.name}, choose your laser target!")

        #inputing x coordinate
        x = get_coordinate("X")

        #inputing y coordinate
        y = get_coordinate("Y")

        #storing both coordinates as a tuple
        player.laser_target = (x, y)

        #print where the player is aiming
        print(f"{player.name}'s target is locked in!")

    print("\nAll lasers aimed! Targets are locked in.")

    #checking who got hit
    players_hit = set()

    for shooter in alive_players:
        for target_player in alive_players:

            #a player cannot hit themselves
            if shooter != target_player:

                #check whether the laser hits another player
                if shooter.laser_target == target_player.position:
                    players_hit.add(target_player)

    #eliminate players only after checking all lasers
    for player in players_hit:
        player.alive = False

    #print the results
    print("\n--- RESULTS ---")

    for player in players:
        if player.alive:
            print(f"{player.name} survived!")
        else:
            print(f"{player.name} got eliminated!")

    #move to the next round
    round_number += 1
