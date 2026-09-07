from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import json
import asyncio
from datetime import datetime, timezone

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Chatterbox", version="2.1.0")

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


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


# ── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # ws -> username
        self.usernames: dict[WebSocket, str] = {}
        # ws -> room name
        self.rooms: dict[WebSocket, str] = {}

    def get_room_members(self, room: str) -> list[str]:
        """Return unique list of online display names in a room."""
        seen = set()
        members = []
        for ws, uname in self.usernames.items():
            if self.rooms.get(ws) == room and uname not in seen:
                seen.add(uname)
                members.append(uname)
        return members

    def get_stats(self) -> dict:
        """Return total active connections and per-room counts."""
        room_counts: dict[str, int] = {}
        for ws_room in self.rooms.values():
            room_counts[ws_room] = room_counts.get(ws_room, 0) + 1
        return {"total_connections": len(self.usernames), "rooms": room_counts}

    def register(self, ws: WebSocket, username: str, room: str):
        """Register a client connection."""
        self.usernames[ws] = username
        self.rooms[ws] = room

    def change_room(self, ws: WebSocket, new_room: str) -> str | None:
        """Update room for connection and return previous room."""
        old_room = self.rooms.get(ws)
        self.rooms[ws] = new_room
        return old_room

    def remove(self, ws: WebSocket) -> tuple[str | None, str | None]:
        """Clean up connection and return (username, room)."""
        user = self.usernames.pop(ws, None)
        room = self.rooms.pop(ws, None)
        return user, room

    async def broadcast_to_room(self, room: str, data: dict, exclude: WebSocket | None = None):
        """Broadcast payload to all active clients in a specific room."""
        data.setdefault("timestamp", now_iso())
        targets = [
            ws for ws, ws_room in list(self.rooms.items())
            if ws_room == room and ws != exclude
        ]

        if not targets:
            return

        async def _safe_send(ws: WebSocket):
            try:
                await ws.send_json(data)
                return None
            except Exception:
                return ws

        results = await asyncio.gather(*[_safe_send(ws) for ws in targets], return_exceptions=True)
        dead = [res for res in results if isinstance(res, WebSocket)]
        for ws in dead:
            self.remove(ws)

    async def broadcast_members(self, room: str):
        """Broadcast updated member list to everyone in the room."""
        members = self.get_room_members(room)
        await self.broadcast_to_room(room, {
            "type": "members",
            "room": room,
            "members": members,
            "timestamp": now_iso(),
        })


manager = ConnectionManager()


# ── REST Endpoints ────────────────────────────────────────────────────────────
@app.get("/rooms/{room}/members")
async def room_members(room: str):
    """Return the list of online members in a room."""
    return JSONResponse({"room": room, "members": manager.get_room_members(room)})


@app.get("/stats")
async def stats():
    """Return total connection count and per-room breakdown."""
    return JSONResponse(manager.get_stats())


# ── WebSocket Endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    username = "Anonymous"
    room = "general"

    try:
        # ── Join Handshake ────────────────────────────────────────────────────
        try:
            raw = await ws.receive_text()
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("Payload must be a JSON object.")
        except (json.JSONDecodeError, ValueError, WebSocketDisconnect, RuntimeError) as exc:
            if isinstance(exc, (json.JSONDecodeError, ValueError)):
                try:
                    await ws.send_json({"type": "error", "message": "Invalid JSON handshake payload."})
                    await ws.close(code=1008)
                except Exception:
                    pass
            return

        username = (data.get("username") or "Anonymous").strip() or "Anonymous"
        room = (data.get("room") or "general").strip() or "general"

        manager.register(ws, username, room)
        logger.info("JOIN  user=%s  room=%s", username, room)

        # Broadcast join system message and updated members list to the room
        await manager.broadcast_to_room(room, {
            "type": "system",
            "message": f"{username} joined #{room}",
        })
        await manager.broadcast_members(room)

        # ── Message Loop ──────────────────────────────────────────────────────
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    await ws.send_json({"type": "error", "message": "Payload must be a JSON object."})
                    continue
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON format."})
                continue

            msg_type: str = data.get("type", "")

            if msg_type == "chat":
                message = (data.get("message") or "").strip()
                if not message:
                    continue
                logger.info("CHAT  user=%s  room=%s  msg=%s", username, room, message[:80])
                await manager.broadcast_to_room(room, {
                    "type": "chat",
                    "username": username,
                    "message": message,
                    "timestamp": now_iso(),
                })

            elif msg_type == "typing":
                await manager.broadcast_to_room(room, {
                    "type": "typing",
                    "username": username,
                }, exclude=ws)

            elif msg_type == "stop_typing":
                await manager.broadcast_to_room(room, {
                    "type": "stop_typing",
                    "username": username,
                }, exclude=ws)

            elif msg_type == "room_change":
                new_room = (data.get("room") or "general").strip() or "general"
                old_room = manager.rooms.get(ws, room)

                if new_room != old_room:
                    # Announce departure to old room (excluding current user)
                    await manager.broadcast_to_room(old_room, {
                        "type": "system",
                        "message": f"{username} left #{old_room}",
                    }, exclude=ws)

                    # Update internal state
                    manager.change_room(ws, new_room)
                    room = new_room
                    logger.info("SWITCH user=%s  %s -> %s", username, old_room, new_room)

                    # Update member list for old room
                    await manager.broadcast_members(old_room)

                    # Announce arrival in new room and broadcast updated member list
                    await manager.broadcast_to_room(new_room, {
                        "type": "system",
                        "message": f"{username} joined #{new_room}",
                    })
                    await manager.broadcast_members(new_room)

    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as exc:
        logger.exception("Unexpected error for user=%s: %s", username, exc)
    finally:
        user, disconnected_room = manager.remove(ws)
        if user and disconnected_room:
            logger.info("LEAVE user=%s  room=%s", user, disconnected_room)
            try:
                await manager.broadcast_to_room(disconnected_room, {
                    "type": "system",
                    "message": f"{user} left #{disconnected_room}",
                })
                await manager.broadcast_members(disconnected_room)
            except Exception:
                pass


if __name__ == "__main__":
    uvicorn.run("main:app", host="localhost", port=8000, reload=True)