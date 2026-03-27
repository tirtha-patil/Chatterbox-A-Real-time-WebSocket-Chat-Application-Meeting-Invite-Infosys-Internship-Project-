from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI()


app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("frontend/index.html")



connections = []
usernames = {}
rooms = {}



async def broadcast(room, data):
    for conn in connections:
        if rooms.get(conn) == room:
            await conn.send_json(data)



@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):

    await ws.accept()

    try:

        data = await ws.receive_json()

        username = data.get("username","Anonymous")
        room = data.get("room","general")

        connections.append(ws)
        usernames[ws] = username
        rooms[ws] = room

        await broadcast(room,{
            "type":"system",
            "message":f"{username} joined {room}"
        })

        while True:

            data = await ws.receive_json()

            if data["type"] == "chat":

                await broadcast(room,{
                    "type":"chat",
                    "username":username,
                    "message":data["message"]
                })

            if data["type"] == "typing":

                await broadcast(room,{
                    "type":"typing",
                    "username":username
                })

            if data["type"] == "stop_typing":

                await broadcast(room,{
                    "type":"stop_typing"
                })

    except WebSocketDisconnect:

        user = usernames.get(ws,"Someone")
        room = rooms.get(ws)

        connections.remove(ws)

        usernames.pop(ws,None)
        rooms.pop(ws,None)

        await broadcast(room,{
            "type":"system",
            "message":f"{user} left {room}"
        })


if __name__ == "__main__":
    uvicorn.run("main:app", host="localhost", port=8000, reload=True)