const chat = document.getElementById("chat")
const typing = document.getElementById("typing")
const roomSelect = document.getElementById("room")

let username = prompt("Enter your name")

const socket = new WebSocket("ws://localhost:8000/ws")

socket.onopen = () => {

socket.send(JSON.stringify({
type:"join",
username:username,
room:roomSelect.value
}))

}

socket.onmessage = (event)=>{

const data = JSON.parse(event.data)

const div = document.createElement("div")

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