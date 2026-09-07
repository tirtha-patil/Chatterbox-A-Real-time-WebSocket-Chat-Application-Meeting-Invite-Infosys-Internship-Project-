/* ═══════════════════════════════════════════════════════════
   Chatterbox — Frontend Logic
   ═══════════════════════════════════════════════════════════ */

// ── Emoji Catalog ─────────────────────────────────────────────────────────
const EMOJIS = [
  '😀','😂','🥲','😍','🤩','😎','🥳','🤔','😅','😭','😤','🤯',
  '👍','👎','👏','🙌','🤝','🫶','❤️','🔥','✨','💯','🎉','🎊',
  '😮','😴','🤫','🤭','😏','🙄','😬','🫠','💀','👀','💪','🫡',
  '🐱','🐶','🐸','🦊','🐼','🦄','🐙','🦋','🌈','☀️','🌙','⭐',
  '🍕','🍔','🍣','🍩','☕','🧃','🍺','🎮','🎵','🏀','⚽','🎯',
];

// Room metadata for icons
const ROOM_ICONS = {
  general: '🌐',
  tech: '💻',
  fun: '🎉',
};

// ── Application State ─────────────────────────────────────────────────────
let socket            = null;
let myUsername        = '';
let currentRoom       = 'general';
let typingTimer       = null;
let isTyping          = false;
let atBottom          = true;
let reconnectTimer    = null;
let reconnectAttempts = 0;
let isIntentionalExit = false;

// ── DOM References ────────────────────────────────────────────────────────
const joinScreen        = document.getElementById('join-screen');
const chatScreen        = document.getElementById('chat-screen');
const usernameInput     = document.getElementById('username-input');
const joinAvatarPreview = document.getElementById('join-avatar-preview');
const joinError         = document.getElementById('join-error');
const messagesWrapper   = document.getElementById('messages-wrapper');
const emptyState        = document.getElementById('empty-state');
const emptyIcon         = document.getElementById('empty-icon');
const emptyRoomName     = document.getElementById('empty-room-name');
const messages          = document.getElementById('messages');
const msgInput          = document.getElementById('msg-input');
const typingBar         = document.getElementById('typing-bar');
const typingText        = document.getElementById('typing-text');
const memberList        = document.getElementById('member-list');
const memberCount       = document.getElementById('member-count');
const headerRoomName    = document.getElementById('header-room-name');
const headerMemberNum   = document.getElementById('header-member-num');
const statusDot         = document.getElementById('status-dot');
const statusText        = document.getElementById('status-text');
const reconnectBtn      = document.getElementById('reconnect-btn');
const connAlert         = document.getElementById('conn-alert');
const myAvatar          = document.getElementById('my-avatar');
const myDisplayName     = document.getElementById('my-display-name');
const myCurrentRoom     = document.getElementById('my-current-room');
const emojiBtn          = document.getElementById('emoji-btn');
const emojiPanel        = document.getElementById('emoji-panel');
const emojiGrid         = document.getElementById('emoji-grid');
const sidebar           = document.getElementById('sidebar');

// ── Emoji Panel Initialization ────────────────────────────────────────────
EMOJIS.forEach((emoji) => {
  const btn = document.createElement('button');
  btn.className = 'emoji-btn-item';
  btn.textContent = emoji;
  btn.title = emoji;
  btn.type = 'button';
  btn.setAttribute('aria-label', `Emoji ${emoji}`);
  btn.addEventListener('click', () => {
    msgInput.value += emoji;
    msgInput.focus();
    closeEmojiPanel();
  });
  emojiGrid.appendChild(btn);
});

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isExpanded = emojiBtn.getAttribute('aria-expanded') === 'true';
  if (isExpanded) {
    closeEmojiPanel();
  } else {
    openEmojiPanel();
  }
});

function openEmojiPanel() {
  emojiPanel.hidden = false;
  emojiBtn.setAttribute('aria-expanded', 'true');
}

function closeEmojiPanel() {
  emojiPanel.hidden = true;
  emojiBtn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
  if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
    closeEmojiPanel();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEmojiPanel();
  }
});

// ── Room Chips (Join Screen) ──────────────────────────────────────────────
document.querySelectorAll('.room-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.room-chip').forEach((c) => {
      c.classList.remove('active');
      c.setAttribute('aria-checked', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-checked', 'true');
    currentRoom = chip.dataset.room;
  });
});

// ── Room List Selection (Chat Screen) ─────────────────────────────────────
document.querySelectorAll('.room-item').forEach((item) => {
  const selectRoomHandler = () => {
    const newRoom = item.dataset.room;
    if (newRoom === currentRoom) return;
    switchRoom(newRoom);
  };
  item.addEventListener('click', selectRoomHandler);
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectRoomHandler();
    }
  });
});

// ── Mobile Sidebar Navigation ─────────────────────────────────────────────
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');

mobileMenuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});
sidebarToggleBtn.addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// Close sidebar on clicking backdrop outside
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 680 && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && e.target !== mobileMenuBtn) {
      sidebar.classList.remove('open');
    }
  }
});

// ── Dynamic Avatar Initial on Join Screen ─────────────────────────────────
usernameInput.addEventListener('input', () => {
  const val = usernameInput.value.trim();
  if (val) {
    joinAvatarPreview.textContent = val.charAt(0).toUpperCase();
    joinAvatarPreview.classList.add('has-letter');
  } else {
    joinAvatarPreview.textContent = '💬';
    joinAvatarPreview.classList.remove('has-letter');
  }
  if (joinError.textContent) {
    joinError.textContent = '';
  }
});

// ── Empty State Management ────────────────────────────────────────────────
function updateEmptyState(roomName) {
  emptyRoomName.textContent = roomName;
  emptyIcon.textContent = ROOM_ICONS[roomName] || '💬';
  checkEmptyState();
}

function checkEmptyState() {
  const hasMessages = messages.children.length > 0;
  if (hasMessages) {
    emptyState.classList.add('hidden');
  } else {
    emptyState.classList.remove('hidden');
  }
}

// ── Auto-scroll Detection ─────────────────────────────────────────────────
messages.addEventListener('scroll', () => {
  atBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 70;
});

function scrollToBottom(force = false) {
  if (atBottom || force) {
    messages.scrollTop = messages.scrollHeight;
  }
}

// ── Helper Utilities ──────────────────────────────────────────────────────
function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

// ── Subtle Audio Notification (when page is backgrounded) ─────────────────
function playNotificationSound() {
  if (document.visibilityState === 'visible') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {
    // Audio context may be restricted by browser autoplay policy
  }
}

// ── Message Renderers ─────────────────────────────────────────────────────
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

  checkEmptyState();

  if (!isMe) {
    playNotificationSound();
  }

  scrollToBottom();
}

function appendSystem(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  messages.appendChild(el);

  checkEmptyState();
  scrollToBottom();
}

// ── Connection Status ─────────────────────────────────────────────────────
function setStatus(state) {
  statusDot.className = `status-dot ${state}`;
  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
  };
  statusText.textContent = labels[state] || state;

  if (state === 'connected') {
    reconnectBtn.classList.add('hidden');
    connAlert.classList.add('hidden');
    reconnectAttempts = 0;
  } else if (state === 'disconnected') {
    reconnectBtn.classList.remove('hidden');
    connAlert.classList.remove('hidden');
  } else if (state === 'connecting') {
    reconnectBtn.classList.add('hidden');
  }
}

// ── Live Members Rendering ────────────────────────────────────────────────
function renderMembers(memberArray) {
  memberList.innerHTML = '';
  const uniqueMembers = Array.from(new Set(memberArray || []));

  uniqueMembers.forEach((name) => {
    const li = document.createElement('li');
    li.className = 'member-item';
    const isMe = name === myUsername;

    li.innerHTML = `
      <div class="member-avatar">${getInitial(name)}</div>
      <span class="member-name-text">${name}${isMe ? ' <small class="me-tag">(you)</small>' : ''}</span>
    `;
    memberList.appendChild(li);
  });

  const count = uniqueMembers.length;
  memberCount.textContent = count;
  headerMemberNum.textContent = count;
}

// ── REST Fallback for Room Members ────────────────────────────────────────
async function fetchMembers(room) {
  try {
    const res = await fetch(`/rooms/${encodeURIComponent(room)}/members`);
    if (!res.ok) return;
    const data = await res.json();
    renderMembers(data.members || []);
  } catch (_) {
    // Silent fail if network issue
  }
}

// ── Room Switching ────────────────────────────────────────────────────────
function switchRoom(newRoom) {
  if (newRoom === currentRoom) return;

  // Update room list UI
  document.querySelectorAll('.room-item').forEach((i) => {
    const isActive = i.dataset.room === newRoom;
    i.classList.toggle('active', isActive);
  });

  currentRoom = newRoom;

  // Update headers and badges
  headerRoomName.textContent = newRoom;
  myCurrentRoom.textContent = `#${newRoom}`;

  // Reset message area & update empty state
  messages.innerHTML = '';
  updateEmptyState(newRoom);
  appendSystem(`Joined #${newRoom}`);

  // Send room_change event over WebSocket
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'room_change', room: newRoom }));
  } else {
    fetchMembers(newRoom);
  }

  // Close mobile drawer
  sidebar.classList.remove('open');
}

// ── Typing Indicator Dispatcher ───────────────────────────────────────────
function sendTyping() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  if (!isTyping) {
    isTyping = true;
    socket.send(JSON.stringify({ type: 'typing' }));
  }

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop_typing' }));
    }
  }, 1400);
}

// ── Send Message ──────────────────────────────────────────────────────────
function sendMessage() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setStatus('disconnected');
    return;
  }

  const text = msgInput.value.trim();
  if (!text) return;

  socket.send(JSON.stringify({ type: 'chat', message: text }));

  // Stop typing
  clearTimeout(typingTimer);
  if (isTyping) {
    isTyping = false;
    socket.send(JSON.stringify({ type: 'stop_typing' }));
  }

  msgInput.value = '';
  msgInput.focus();
  closeEmojiPanel();
}

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

msgInput.addEventListener('input', sendTyping);

// ── WebSocket Connection & Lifecycle ──────────────────────────────────────
function getWebSocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = location.host || 'localhost:8000';
  return `${protocol}//${host}/ws`;
}

function connectWebSocket(username, room) {
  if (socket) {
    try {
      socket.close();
    } catch (_) {}
  }

  setStatus('connecting');
  const wsUrl = getWebSocketUrl();

  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    console.error('WebSocket initialization error:', err);
    setStatus('disconnected');
    scheduleAutoReconnect();
    return;
  }

  socket.onopen = () => {
    setStatus('connected');
    // Perform handshake join
    socket.send(JSON.stringify({ type: 'join', username, room }));
  };

  socket.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.warn('Invalid JSON message received:', event.data);
      return;
    }

    switch (data.type) {
      case 'chat':
        appendMessage(data);
        break;

      case 'system':
        appendSystem(data.message);
        break;

      case 'typing':
        if (data.username && data.username !== myUsername) {
          typingBar.classList.add('active');
          typingText.textContent = `${data.username} is typing…`;
        }
        break;

      case 'stop_typing':
        typingBar.classList.remove('active');
        typingText.textContent = '';
        break;

      case 'members':
        if (!data.room || data.room === currentRoom) {
          renderMembers(data.members || []);
        }
        break;

      case 'error':
        console.error('Server error response:', data.message);
        break;
    }
  };

  socket.onclose = (e) => {
    if (!isIntentionalExit) {
      setStatus('disconnected');
      scheduleAutoReconnect();
    }
  };

  socket.onerror = (err) => {
    console.warn('WebSocket connection error:', err);
    setStatus('disconnected');
  };
}

function scheduleAutoReconnect() {
  if (reconnectTimer || !myUsername) return;
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 10000);
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (socket && socket.readyState === WebSocket.OPEN) return;
    if (myUsername) {
      console.info(`Attempting auto-reconnect (${reconnectAttempts})…`);
      connectWebSocket(myUsername, currentRoom);
    }
  }, delay);
}

function reconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (!myUsername) return;
  connectWebSocket(myUsername, currentRoom);
}

// ── Join Chat Flow ────────────────────────────────────────────────────────
function joinChat() {
  const name = usernameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your display name to continue.';
    usernameInput.focus();
    return;
  }
  if (name.length < 2) {
    joinError.textContent = 'Name must be at least 2 characters.';
    usernameInput.focus();
    return;
  }
  if (name.length > 30) {
    joinError.textContent = 'Name must be 30 characters or fewer.';
    usernameInput.focus();
    return;
  }

  joinError.textContent = '';
  myUsername = name;

  // Update user profile badges
  myAvatar.textContent = getInitial(name);
  myDisplayName.textContent = name;
  myCurrentRoom.textContent = `#${currentRoom}`;

  // Update sidebar active room
  document.querySelectorAll('.room-item').forEach((i) => {
    i.classList.toggle('active', i.dataset.room === currentRoom);
  });

  headerRoomName.textContent = currentRoom;
  updateEmptyState(currentRoom);

  // Transition UI
  joinScreen.classList.add('hidden');
  joinScreen.setAttribute('aria-hidden', 'true');
  chatScreen.classList.remove('hidden');
  chatScreen.setAttribute('aria-hidden', 'false');

  // Initiate WebSocket
  connectWebSocket(myUsername, currentRoom);
  msgInput.focus();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinChat();
  }
});

// Focus on page load
window.addEventListener('DOMContentLoaded', () => {
  usernameInput.focus();
});