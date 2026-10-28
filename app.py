from flask import Flask, render_template
from flask_socketio import SocketIO

from config import Config
from room_manager import RoomManager
from socket_events import register_socket_events

app = Flask(__name__)
app.config.from_object(Config)

# threading mode works everywhere (including Windows) with no extra installs
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")

rooms = RoomManager()
register_socket_events(socketio, rooms)


@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    socketio.run(
        app,
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
        allow_unsafe_werkzeug=True,
    )