"""A small real-time chatroom built with Flask and Flask-SocketIO."""

import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "classroom-demo-only")
socketio = SocketIO(app, async_mode="threading")

# Each connected browser is identified by a unique Socket.IO session ID.
clients = {}
MAX_NAME_LENGTH = 30
MAX_MESSAGE_LENGTH = 2000


@app.get("/")
def index():
    return render_template("index.html")


def normalize_username(value):
    if not isinstance(value, str):
        return ""
    return value.strip()[:MAX_NAME_LENGTH]


def broadcast_user_count():
    count = sum(bool(name) for name in clients.values())
    socketio.emit("user_count", {"count": count})


@socketio.on("connect")
def on_connect(auth=None):
    clients[request.sid] = ""
    print("Client connected:", request.sid)


@socketio.on("join")
def on_join(data):
    if request.sid not in clients:
        return

    data = data if isinstance(data, dict) else {}
    username = normalize_username(data.get("username")) or "Anonymous"
    previous_name = clients[request.sid]
    clients[request.sid] = username

    if not previous_name:
        emit("user_joined", {"username": username}, broadcast=True)
    elif previous_name != username:
        emit(
            "user_changed_name",
            {"oldUsername": previous_name, "newUsername": username},
            broadcast=True,
        )

    broadcast_user_count()
    print(username, "joined")


@socketio.on("send_message")
def on_message(data):
    sender = clients.get(request.sid)
    if not sender or not isinstance(data, dict):
        return

    content = data.get("content")
    if not isinstance(content, str):
        return
    content = content.strip()
    if not content or len(content) > MAX_MESSAGE_LENGTH:
        return

    # The server uses the recorded name instead of trusting a sender name
    # submitted by the browser.
    emit(
        "chat_message",
        {"username": sender, "content": content},
        broadcast=True,
        include_self=False,
    )


@socketio.on("typing")
def on_typing(data=None):
    username = clients.get(request.sid)
    if username:
        emit(
            "typing", {"username": username},
            broadcast=True, include_self=False,
        )


@socketio.on("change_username")
def on_change_username(data):
    if request.sid not in clients or not isinstance(data, dict):
        return

    old = clients[request.sid]
    new = normalize_username(data.get("newUsername"))
    if not new or not old or new == old:
        return

    clients[request.sid] = new
    emit(
        "user_changed_name",
        {"oldUsername": old, "newUsername": new},
        broadcast=True,
    )


@socketio.on("disconnect")
def on_disconnect(reason=None):
    username = clients.pop(request.sid, None)
    if username:
        emit("user_left", {"username": username}, broadcast=True)
    broadcast_user_count()
    print("Client disconnected:", request.sid)


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"Open this URL in your browser: http://127.0.0.1:{port}")
    socketio.run(app, host=host, port=port, debug=True, use_reloader=False)
