import random #gives python access to random number generation functions

#map size: 10 x 10
MAP_SIZE = 10

class Player:
    def __init__(self, name, position):
        self.name = name
        self.position = position
        self.alive = True

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