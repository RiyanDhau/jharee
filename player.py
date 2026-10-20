
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
