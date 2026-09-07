# 💬 Chatterbox

A real-time multi-room chat application built using **FastAPI, WebSockets, and Vanilla JavaScript**.

## 🚀 Live Demo

🔗 https://chatterbox-a-real-time-websocket-chat.onrender.com

> The application may take a few seconds to load initially as it is deployed on Render's free tier.

## ✨ Features

- ⚡ Real-time messaging using WebSockets
- 🏷️ Multi-room chat support
- 👥 Live member tracking
- ✍️ Typing indicators
- 🔄 Dynamic room switching
- 😀 Built-in emoji picker
- 🔔 Notification sounds for incoming messages
- 📊 REST API for connection statistics
- 🔌 Automatic WebSocket reconnection
- 📱 Responsive user interface

## 🛠️ Tech Stack

**Backend**
- Python
- FastAPI
- WebSockets
- Uvicorn

**Frontend**
- HTML
- CSS
- Vanilla JavaScript

**Deployment**
- GitHub
- Render

## 📂 Project Structure

```text
Chatterbox/
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── main.py
├── requirements.txt
├── README.md
└── LICENSE

to run locally:-
git clone https://github.com/tirtha-patil/Chatterbox-A-Real-time-WebSocket-Chat-Application-Meeting-Invite-Infosys-Internship-Project-.git

cd Chatterbox

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt

uvicorn main:app --reload

then open
http://localhost:8000


🎓 Project Context

Developed as part of the Infosys Springboard Virtual Internship Program, focusing on real-time communication using WebSockets and FastAPI.

👩‍💻 Author

Tirtha Patil

Computer Science Engineering (AI & ML)