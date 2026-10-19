
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

#inputing the number of players
num_players = int(input("How many players are playing? "))

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

#each player chooses where their laser is aiming
print("\n--- LASER AIMING ---")

for player in players:
    print(f"\n{player.name}, choose your laser target!")

    #inputing x coordinate
    x = int(input("Enter target X (0-9): "))

    #inputing y coordinate
    y = int(input("Enter target Y (0-9): "))

    #storing both coordinates as a tuple
    player.laser_target = (x, y)

    #print where the player is aiming
    print(f"{player.name} is aiming at {player.laser_target}")

print("\nAll lasers aimed! Targets are locked in.")
#checking who got hit
players_hit = []

for shooter in players:
    for target_player in players:

        #a player cannot hit themselves
        if shooter != target_player:

            #check whether the laser hits another player
            if shooter.laser_target == target_player.position:
                players_hit.append(target_player)

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
