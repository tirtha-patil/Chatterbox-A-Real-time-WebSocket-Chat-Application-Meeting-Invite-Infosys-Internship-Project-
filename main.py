from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
from datetime import datetime


app = FastAPI(title="Chatterbox Milestone 1")


connected_clients = []


@app.get("/")
async def home():
    return {
        "status": "Server is running 🚀",
        "timestamp": str(datetime.now())
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)

    print("✅ Client connected")
    print(f"Total clients: {len(connected_clients)}")

    try:
        while True:
            message = await websocket.receive_text()
            print(f"📩 Received: {message}")

            response = f"Server received: {message}"
            await websocket.send_text(response)

    except WebSocketDisconnect:
        connected_clients.remove(websocket)
        print("❌ Client disconnected")
        print(f"Total clients: {len(connected_clients)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)