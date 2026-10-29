# Game-wide numbers. The arena is a flat top-down map measured in "arena units".
# The browser draws it at 480 x 270 and scales it up, so keep these in sync with static/js/game.js.

ARENA_W = 480
ARENA_H = 270

HIT_RADIUS = 12        # how close a laser beam must pass to a player's centre to hit them
MIN_AIM_DISTANCE = 10  # a target closer than this to your own position is rejected
EDGE_MARGIN = 10       # players can't stand closer than this to the edge of the arena

# every round where nobody gets hit, the arena shrinks to SHRINK_FACTOR of its size (down to a minimum)
SHRINK_FACTOR = 0.8
MIN_ARENA_SCALE = 0.3

# no fixed room size: anyone with the room code can join while the room is still in the lobby.
# the game starts once everyone in the lobby clicks READY (and there are at least MIN_PLAYERS).
# MAX_PLAYERS is only a safety limit so one room can't grow forever.
MIN_PLAYERS = 2
MAX_PLAYERS = 100

ROOM_CODE_LENGTH = 4
ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I or O so codes are easy to read out loud

# time limits in seconds. Everyone works at their own pace: place yourself, then aim and fire.
# PLACE_SECONDS: after this, a player who still hasn't chosen a spot is put at a random one.
# PLACE_SECONDS + AIM_SECONDS: after this, a player who still hasn't fired doesn't shoot that round,
# and the round is revealed.
PLACE_SECONDS = 40
AIM_SECONDS = 30

MAX_NAME_LENGTH = 12