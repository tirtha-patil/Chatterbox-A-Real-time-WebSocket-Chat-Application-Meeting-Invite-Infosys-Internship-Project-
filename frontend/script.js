/* ═══════════════════════════════════════════════════════════
   Chatterbox — Frontend Logic v2
   ═══════════════════════════════════════════════════════════ */

// ── Emoji set ──────────────────────────────────────────────────────────────
const EMOJIS = [
  '😀','😂','🥲','😍','🤩','😎','🥳','🤔','😅','😭','😤','🤯',
  '👍','👎','👏','🙌','🤝','🫶','❤️','🔥','✨','💯','🎉','🎊',
  '😮','😴','🤫','🤭','😏','🙄','😬','🫠','💀','👀','💪','🫡',
  '🐱','🐶','🐸','🦊','🐼','🦄','🐙','🦋','🌈','☀️','🌙','⭐',
  '🍕','🍔','🍣','🍩','☕','🧃','🍺','🎮','🎵','🏀','⚽','🎯',
];

// ── State ──────────────────────────────────────────────────────────────────
let socket        = null;
let myUsername    = '';
let currentRoom   = 'general';
let typingTimer   = null;
let isTyping      = false;
let atBottom      = true;   // auto-scroll toggle

// ── DOM refs ───────────────────────────────────────────────────────────────
const joinScreen      = document.getElementById('join-screen');
const chatScreen      = document.getElementById('chat-screen');
const usernameInput   = document.getElementById('username-input');
const joinError       = document.getElementById('join-error');
const messages        = document.getElementById('messages');
const msgInput        = document.getElementById('msg-input');
const typingBar       = document.getElementById('typing-bar');
const typingText      = document.getElementById('typing-text');
const memberList      = document.getElementById('member-list');
const memberCount     = document.getElementById('member-count');
const headerRoomName  = document.getElementById('header-room-name');
const headerMemberNum = document.getElementById('header-member-num');
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const myAvatar        = document.getElementById('my-avatar');
const myDisplayName   = document.getElementById('my-display-name');
const emojiPanel      = document.getElementById('emoji-panel');
const emojiGrid       = document.getElementById('emoji-grid');
const sidebar         = document.getElementById('sidebar');

// ── Emoji panel ────────────────────────────────────────────────────────────
EMOJIS.forEach(emoji => {
  const btn = document.createElement('button');
  btn.className = 'emoji-btn-item';
  btn.textContent = emoji;
  btn.title = emoji;
  btn.type = 'button';
  btn.addEventListener('click', () => {
    msgInput.value += emoji;
    msgInput.focus();
    closeEmojiPanel();
  });
  emojiGrid.appendChild(btn);
});

document.getElementById('emoji-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const isHidden = emojiPanel.hidden;
  emojiPanel.hidden = !isHidden;
});

document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target) && e.target.id !== 'emoji-btn') {
    closeEmojiPanel();
  }
});

function closeEmojiPanel() {
  emojiPanel.hidden = true;
}

// ── Room chips (join screen) ───────────────────────────────────────────────
document.querySelectorAll('.room-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.room-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentRoom = chip.dataset.room;
  });
});

// ── Sidebar — room list (chat screen) ─────────────────────────────────────
document.querySelectorAll('.room-item').forEach(item => {
  item.addEventListener('click', () => {
    const newRoom = item.dataset.room;
    if (newRoom === currentRoom) return;
    switchRoom(newRoom);
  });
});

// ── Mobile sidebar toggle ─────────────────────────────────────────────────
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  sidebar.classList.toggle('open');
});
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.toggle('open');
});
// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 680 && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && e.target.id !== 'mobile-menu-btn') {
      sidebar.classList.remove('open');
    }
  }
});

// ── Auto-scroll detection ─────────────────────────────────────────────────
messages.addEventListener('scroll', () => {
  atBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 60;
});

function scrollToBottom(force = false) {
  if (atBottom || force) {
    messages.scrollTop = messages.scrollHeight;
  }
}

// ── Time formatting ───────────────────────────────────────────────────────
function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Avatar initial ────────────────────────────────────────────────────────
function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ── Sound notification (background tab) ───────────────────────────────────
function playNotificationSound() {
  if (document.visibilityState === 'visible') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) { /* AudioContext not available */ }
}

// ── Render a chat message bubble ──────────────────────────────────────────
function appendMessage(data) {
  const isMe = data.username === myUsername;
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${isMe ? 'me' : 'other'}`;

  const header = document.createElement('div');
  header.className = 'msg-header';

  if (!isMe) {
    const uname = document.createElement('span');
    uname.className = 'msg-username';
    uname.textContent = data.username;
    header.appendChild(uname);
  }

  if (data.timestamp) {
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = formatTime(data.timestamp);
    header.appendChild(time);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = data.message;

  wrapper.appendChild(header);
  wrapper.appendChild(bubble);
  messages.appendChild(wrapper);

  if (!isMe) playNotificationSound();

  scrollToBottom();
}

// ── Render a system message pill ─────────────────────────────────────────
function appendSystem(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  messages.appendChild(el);
  scrollToBottom();
}

// ── Update connection status indicator ───────────────────────────────────
function setStatus(state) {
  statusDot.className = 'status-dot ' + state;
  const labels = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting…' };
  statusText.textContent = labels[state] || state;
}

// ── Update members panel ─────────────────────────────────────────────────
function renderMembers(members) {
  memberList.innerHTML = '';
  members.forEach(name => {
    const li = document.createElement('li');
    li.className = 'member-item';
    li.innerHTML = `
      <div class="member-avatar">${getInitial(name)}</div>
      <span>${name}</span>
    `;
    memberList.appendChild(li);
  });
  const count = members.length;
  memberCount.textContent = count;
  headerMemberNum.textContent = count;
}

// ── Fetch members via REST ───────────────────────────────────────────────
async function fetchMembers(room) {
  try {
    const res = await fetch(`/rooms/${encodeURIComponent(room)}/members`);
    const data = await res.json();
    renderMembers(data.members || []);
  } catch (_) { /* ignore */ }
}

// ── Switch room ──────────────────────────────────────────────────────────
function switchRoom(newRoom) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  // Update sidebar active state
  document.querySelectorAll('.room-item').forEach(i => i.classList.remove('active'));
  const item = document.getElementById(`room-item-${newRoom}`);
  if (item) item.classList.add('active');

  // Update header
  headerRoomName.textContent = newRoom;

  // Clear chat
  messages.innerHTML = '';
  appendSystem(`Switched to #${newRoom}`);

  // Notify server
  socket.send(JSON.stringify({ type: 'room_change', room: newRoom }));
  currentRoom = newRoom;

  // Close mobile sidebar
  sidebar.classList.remove('open');

  // Fetch fresh member list
  fetchMembers(newRoom);
}

// ── Typing indicator ─────────────────────────────────────────────────────
function sendTyping() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (!isTyping) {
    isTyping = true;
    socket.send(JSON.stringify({ type: 'typing' }));
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    socket.send(JSON.stringify({ type: 'stop_typing' }));
  }, 1500);
}

// ── Send message ─────────────────────────────────────────────────────────
function sendMessage() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const text = msgInput.value.trim();
  if (!text) return;

  socket.send(JSON.stringify({ type: 'chat', message: text }));

  // Stop typing
  clearTimeout(typingTimer);
  isTyping = false;
  socket.send(JSON.stringify({ type: 'stop_typing' }));

  msgInput.value = '';
  msgInput.focus();
  closeEmojiPanel();
}

// ── Enter key to send ────────────────────────────────────────────────────
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

msgInput.addEventListener('input', sendTyping);

// ── Connect WebSocket ────────────────────────────────────────────────────
function connectWebSocket(username, room) {
  setStatus('connecting');
  socket = new WebSocket(`ws://${location.host}/ws`);

  socket.onopen = () => {
    setStatus('connected');
    socket.send(JSON.stringify({ type: 'join', username, room }));
  };

  socket.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); }
    catch { return; }

    switch (data.type) {
      case 'chat':
        appendMessage(data);
        break;

      case 'system':
        appendSystem(data.message);
        // Re-fetch members when someone joins/leaves
        fetchMembers(currentRoom);
        break;

      case 'typing':
        if (data.username !== myUsername) {
          typingBar.classList.add('active');
          typingText.textContent = `${data.username} is typing…`;
        }
        break;

      case 'stop_typing':
        typingBar.classList.remove('active');
        typingText.textContent = '';
        break;

      case 'members':
        renderMembers(data.members || []);
        break;

      case 'error':
        console.error('Server error:', data.message);
        break;
    }
  };

  socket.onclose = () => {
    setStatus('disconnected');
    appendSystem('Disconnected from server. Refresh to reconnect.');
  };

  socket.onerror = () => {
    setStatus('disconnected');
  };
}

// ── Join chat ─────────────────────────────────────────────────────────────
function joinChat() {
  const name = usernameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your name to continue.';
    usernameInput.focus();
    return;
  }
  if (name.length < 2) {
    joinError.textContent = 'Name must be at least 2 characters.';
    usernameInput.focus();
    return;
  }
  joinError.textContent = '';

  myUsername = name;

  // Update sidebar user identity
  myAvatar.textContent = getInitial(name);
  myDisplayName.textContent = name;

  // Update sidebar room state
  document.querySelectorAll('.room-item').forEach(i => i.classList.remove('active'));
  const roomItem = document.getElementById(`room-item-${currentRoom}`);
  if (roomItem) roomItem.classList.add('active');

  // Update header
  headerRoomName.textContent = currentRoom;

  // Show chat screen
  joinScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  // Connect
  connectWebSocket(myUsername, currentRoom);
  msgInput.focus();
}

// ── Allow Enter on join screen ────────────────────────────────────────────
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinChat();
});

// ── Focus username input on load ──────────────────────────────────────────
usernameInput.focus();