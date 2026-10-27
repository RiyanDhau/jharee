# Game-wide numbers. The arena is a flat top-down map measured in "arena units".
# The browser draws it at 320 x 180 and scales it up, so keep these in sync with static/js/game.js.

ARENA_W = 320
ARENA_H = 180

HIT_RADIUS = 12        # how close a laser beam must pass to a player's centre to hit them
MIN_AIM_DISTANCE = 10  # a target closer than this to your own position is rejected

# the person who creates a room picks how many players it holds (between these two numbers)
MIN_PLAYERS = 2
MAX_PLAYERS = 8        # the browser has 8 player colours; raise both if you want more

ROOM_CODE_LENGTH = 4
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I or O so codes are easy to read out loud

# players spawn anywhere in the arena, but not too close to each other
SPAWN_MARGIN = 24
SPAWN_MIN_DISTANCE = 45

# between rounds the survivors shuffle a little
JITTER = 30
EDGE_MARGIN = 14

MAX_NAME_LENGTH = 12