const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const statusSpan = document.getElementById("status");

// Ask username
let username = "";
while (!username) {
    username = prompt("Enter your name:");
    if (username) username = username.trim();
}

// Connect to WebSocket
const socket = new WebSocket("ws://127.0.0.1:8000/ws");

socket.onopen = () => {
    statusSpan.textContent = "Connected ✅";
    addSystemMessage("Connected to server");
};

socket.onmessage = (event) => {
    addMessage(event.data);
};

socket.onclose = () => {
    statusSpan.textContent = "Disconnected ❌";
    addSystemMessage("Disconnected from server");
};

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage();
});

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    socket.send(username + ": " + message);
    messageInput.value = "";
}

function addMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("message");
    msg.textContent = text;
    chatBox.appendChild(msg);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addSystemMessage(text) {
    const msg = document.createElement("div");
    msg.classList.add("system");
    msg.textContent = text;
    chatBox.appendChild(msg);
}