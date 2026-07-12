from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import json
from datetime import datetime, timezone

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Chatterbox", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def read_index():
    return FileResponse("frontend/index.html")


# ── State ─────────────────────────────────────────────────────────────────────
# ws -> username
usernames: dict[WebSocket, str] = {}
# ws -> room name
rooms: dict[WebSocket, str] = {}


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ── Helpers ───────────────────────────────────────────────────────────────────
async def broadcast(room: str, data: dict):
    """Send a JSON payload to every connection in the given room."""
    data.setdefault("timestamp", now_iso())
    dead: list[WebSocket] = []
    for ws, ws_room in list(rooms.items()):
        if ws_room == room:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
    for ws in dead:
        _remove_connection(ws)


def _remove_connection(ws: WebSocket):
    """Clean up a disconnected websocket from state dicts."""
    usernames.pop(ws, None)
    rooms.pop(ws, None)


def get_room_members(room: str) -> list[str]:
    """Return list of usernames currently in a room."""
    return [uname for ws, uname in usernames.items() if rooms.get(ws) == room]


# ── REST ──────────────────────────────────────────────────────────────────────
@app.get("/rooms/{room}/members")
async def room_members(room: str):
    """Return the list of online members in a room."""
    return JSONResponse({"room": room, "members": get_room_members(room)})


@app.get("/stats")
async def stats():
    """Return total connection count and per-room breakdown."""
    room_counts: dict[str, int] = {}
    for ws_room in rooms.values():
        room_counts[ws_room] = room_counts.get(ws_room, 0) + 1
    return JSONResponse({"total_connections": len(usernames), "rooms": room_counts})


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    try:
        # ── Join handshake ────────────────────────────────────────────────────
        raw = await ws.receive_text()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            await ws.send_json({"type": "error", "message": "Invalid JSON in join handshake."})
            await ws.close()
            return

        username: str = (data.get("username") or "Anonymous").strip() or "Anonymous"
        room: str = (data.get("room") or "general").strip() or "general"

        usernames[ws] = username
        rooms[ws] = room

        logger.info("JOIN  user=%s  room=%s", username, room)

        # Send the user the current member list of their room
        await ws.send_json({
            "type": "members",
            "members": get_room_members(room),
            "timestamp": now_iso(),
        })

        await broadcast(room, {
            "type": "system",
            "message": f"{username} joined #{room}",
        })

        # ── Message loop ──────────────────────────────────────────────────────
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON."})
                continue

            msg_type: str = data.get("type", "")

            if msg_type == "chat":
                message = (data.get("message") or "").strip()
                if not message:
                    continue
                logger.info("CHAT  user=%s  room=%s  msg=%s", username, room, message[:80])
                await broadcast(room, {
                    "type": "chat",
                    "username": username,
                    "message": message,
                })

            elif msg_type == "typing":
                await broadcast(room, {
                    "type": "typing",
                    "username": username,
                })

            elif msg_type == "stop_typing":
                await broadcast(room, {
                    "type": "stop_typing",
                    "username": username,
                })

            elif msg_type == "room_change":
                old_room = rooms.get(ws, room)
                new_room = (data.get("room") or "general").strip() or "general"

                if new_room != old_room:
                    # Announce departure from old room
                    await broadcast(old_room, {
                        "type": "system",
                        "message": f"{username} left #{old_room}",
                    })
                    rooms[ws] = new_room
                    room = new_room
                    logger.info("SWITCH user=%s  %s -> %s", username, old_room, new_room)

                    # Send updated member list to the user
                    await ws.send_json({
                        "type": "members",
                        "members": get_room_members(new_room),
                        "timestamp": now_iso(),
                    })

                    await broadcast(new_room, {
                        "type": "system",
                        "message": f"{username} joined #{new_room}",
                    })

    except WebSocketDisconnect:
        user = usernames.get(ws, "Someone")
        disconnected_room = rooms.get(ws)
        _remove_connection(ws)
        logger.info("LEAVE user=%s  room=%s", user, disconnected_room)
        if disconnected_room:
            await broadcast(disconnected_room, {
                "type": "system",
                "message": f"{user} left #{disconnected_room}",
            })

    except Exception as exc:
        logger.exception("Unexpected error for user=%s: %s", usernames.get(ws, "?"), exc)
        _remove_connection(ws)


if __name__ == "__main__":
    uvicorn.run("main:app", host="localhost", port=8000, reload=True)