from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

active_connections = []
usernames = {}
rooms = {}

html = """
<!DOCTYPE html>
<html>
<head>
<title>Chatterbox</title>

<style>

body{
font-family:Arial;
background:#f4f6f8;
margin:0;
padding:0;
display:flex;
justify-content:center;
align-items:center;
height:100vh;
}

.container{
width:600px;
background:white;
border-radius:10px;
box-shadow:0 5px 15px rgba(0,0,0,0.1);
padding:20px;
}

h2{
text-align:center;
}

#chat{
height:350px;
overflow-y:auto;
border:1px solid #ddd;
padding:10px;
margin-bottom:10px;
}

.message{
margin:5px 0;
}

.system{
color:gray;
font-style:italic;
}

#typing{
color:green;
font-size:14px;
}

input{
width:80%;
padding:10px;
}

button{
padding:10px 15px;
background:#0a7cff;
border:none;
color:white;
cursor:pointer;
}

button:hover{
background:#095edb;
}

</style>
</head>

<body>

<div class="container">

<h2>💬 Chatterbox</h2>

<label>Select Room</label>

<select id="room">
<option value="general">General</option>
<option value="tech">Tech</option>
<option value="fun">Fun</option>
</select>

<div id="chat"></div>

<div id="typing"></div>

<input id="msg" placeholder="Type message">

<button onclick="sendMessage()">Send</button>

</div>

<script>

const chat=document.getElementById("chat")
const typing=document.getElementById("typing")
const roomSelect=document.getElementById("room")

let username=prompt("Enter your name")

const socket=new WebSocket("ws://localhost:8000/ws")

socket.onopen=()=>{

socket.send(JSON.stringify({
type:"join",
username:username,
room:roomSelect.value
}))

}

socket.onmessage=(event)=>{

const data=JSON.parse(event.data)

const div=document.createElement("div")

div.classList.add("message")

if(data.type==="chat"){
div.innerHTML="<b>"+data.username+":</b> "+data.message
}

if(data.type==="system"){
div.classList.add("system")
div.innerText=data.message
}

if(data.type==="typing"){
typing.innerText=data.username+" is typing..."
}

if(data.type==="stop_typing"){
typing.innerText=""
}

chat.appendChild(div)

chat.scrollTop=chat.scrollHeight

}

function sendMessage(){

const msg=document.getElementById("msg").value

if(msg==="") return

socket.send(JSON.stringify({
type:"chat",
message:msg
}))

socket.send(JSON.stringify({
type:"stop_typing"
}))

document.getElementById("msg").value=""

}

document.getElementById("msg").addEventListener("input",()=>{
socket.send(JSON.stringify({type:"typing"}))
})

</script>

</body>
</html>
"""

@app.get("/")
async def home():
    return HTMLResponse(html)

async def broadcast(room,data):

    for connection in active_connections:
        if rooms.get(connection)==room:
            await connection.send_json(data)

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):

    await ws.accept()

    try:

        data=await ws.receive_json()

        username=data.get("username","Anonymous")
        room=data.get("room","general")

        active_connections.append(ws)
        usernames[ws]=username
        rooms[ws]=room

        await broadcast(room,{
        "type":"system",
        "message":f"{username} joined {room} 👋"
        })

        while True:

            data=await ws.receive_json()

            if data["type"]=="chat":

                await broadcast(room,{
                "type":"chat",
                "username":username,
                "message":data["message"]
                })

            if data["type"]=="typing":

                await broadcast(room,{
                "type":"typing",
                "username":username
                })

            if data["type"]=="stop_typing":

                await broadcast(room,{
                "type":"stop_typing"
                })

    except WebSocketDisconnect:

        left_user=usernames.get(ws,"Someone")
        room=rooms.get(ws)

        if ws in active_connections:
            active_connections.remove(ws)

        usernames.pop(ws,None)
        rooms.pop(ws,None)

        await broadcast(room,{
        "type":"system",
        "message":f"{left_user} left {room} ❌"
        })

if __name__=="__main__":
    uvicorn.run("main:app",host="localhost",port=8000,reload=True)