"use strict";

// A nickname is retained when the same browser tab is refreshed.
let username = sessionStorage.getItem("chat_username");
if (!username) {
  username = "使用者" + Math.floor(Math.random() * 10000);
  sessionStorage.setItem("chat_username", username);
}
username = username.trim().slice(0, 30) || "Anonymous";

const chatMessages = document.getElementById("chat-messages");
const messageInput = document.getElementById("message-input");
const statusBox = document.getElementById("connection-status");
const typingIndicators = new Map();
let typingThrottle = false;
let socket = null;

function scrollBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateStatus(connected, message) {
  statusBox.textContent = message || (connected ? "已連線" : "連線中斷");
  statusBox.style.display = "block";
  statusBox.style.backgroundColor = connected ? "#d4edda" : "#f8d7da";
  if (connected) {
    window.setTimeout(() => {
      if (socket && socket.connected) statusBox.style.display = "none";
    }, 3000);
  }
}

// Keep usernames and system messages as plain text, not HTML.
function addSystem(message) {
  const el = document.createElement("div");
  el.className = "connection-status";
  el.textContent = message;
  chatMessages.append(el);
  scrollBottom();
}

function renderMessageContent(container, text) {
  if (window.marked && window.DOMPurify) {
    const html = DOMPurify.sanitize(marked.parse(text));
    container.innerHTML = html;
  } else {
    container.textContent = text;
    container.style.whiteSpace = "pre-wrap";
  }

  container.querySelectorAll("pre code").forEach((code) => {
    const isMermaid = code.classList.contains("language-mermaid");
    const pre = code.parentElement;
    const rawText = code.textContent;
    if (isMermaid && window.mermaid) {
      const chart = document.createElement("pre");
      chart.className = "mermaid";
      chart.textContent = rawText;
      pre.replaceWith(chart);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "code-block";
      const copy = document.createElement("button");
      copy.className = "copy-btn";
      copy.type = "button";
      copy.textContent = "複製";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(rawText);
          copy.textContent = "已複製！";
          window.setTimeout(() => (copy.textContent = "複製"), 1500);
        } catch (error) {
          alert("複製失敗");
        }
      });
      pre.replaceWith(wrap);
      wrap.append(copy, pre);
      if (window.hljs) hljs.highlightElement(code);
    }
  });

  if (window.mermaid) {
    try {
      mermaid.run({nodes: Array.from(container.querySelectorAll(".mermaid"))})
        .catch((error) => console.warn("Mermaid rendering error:", error));
    } catch (error) {
      console.warn("Mermaid rendering error:", error);
    }
  }
}

function addMessage(content, isMe, sender) {
  const wrapper = document.createElement("div");
  wrapper.className = "message " + (isMe ? "user-message" : "other-message") + " clearfix";

  if (!isMe) {
    const info = document.createElement("div");
    info.className = "user-info";
    const name = document.createElement("span");
    name.className = "user-name";
    name.textContent = sender;
    info.append(name);
    wrapper.append(info);
  }

  const bubble = document.createElement("div");
  bubble.className = "message-content";
  renderMessageContent(bubble, content);
  wrapper.append(bubble);

  const time = document.createElement("div");
  time.className = "message-time";
  time.textContent = new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit", minute: "2-digit"
  });
  wrapper.append(time);
  chatMessages.append(wrapper);
  scrollBottom();
}

function showTyping(user) {
  if (typingIndicators.has(user)) {
    const entry = typingIndicators.get(user);
    clearTimeout(entry.timer);
    entry.element.remove();
  }

  const element = document.createElement("div");
  element.className = "typing-indicator";
  element.textContent = user + " 正在輸入...";
  chatMessages.append(element);

  const timer = window.setTimeout(() => {
    element.remove();
    typingIndicators.delete(user);
  }, 3000);
  typingIndicators.set(user, {element, timer});
  scrollBottom();
}

function send() {
  const content = messageInput.value.trim();
  if (!content) return;
  if (!socket || !socket.connected) {
    updateStatus(false, "尚未連線，無法送出訊息");
    return;
  }
  if (content.length > 2000) {
    alert("每則訊息最多 2000 個字元");
    return;
  }
  addMessage(content, true, username);
  socket.emit("send_message", {content});
  messageInput.value = "";
  messageInput.style.height = "auto";
}

// Socket.IO loads from the CDN in templates/index.html.
if (typeof window.io === "function") {
  socket = io();
  socket.on("connect", () => {
    updateStatus(true, "已連線");
    socket.emit("join", {username});
  });
  socket.on("disconnect", () => updateStatus(false, "連線中斷，正在重試..."));
  socket.on("connect_error", () => updateStatus(false, "連線失敗，請檢查伺服器"));
  socket.on("user_count", (data) => {
    document.getElementById("online-count").textContent = data.count;
  });
  socket.on("user_joined", (data) => addSystem(data.username + " 加入了聊天"));
  socket.on("user_left", (data) => addSystem(data.username + " 離開了聊天"));
  socket.on("chat_message", (data) => addMessage(data.content, false, data.username));
  socket.on("typing", (data) => showTyping(data.username));
  socket.on("user_changed_name", (data) => {
    addSystem(data.oldUsername + " 更名為 " + data.newUsername);
  });
} else {
  updateStatus(false, "Socket.IO 套件載入失敗，請檢查網路或 CDN");
}

// Send buttons, keyboard shortcuts, and nickname management.
document.getElementById("send-button").addEventListener("click", send);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
  if (socket && socket.connected && !typingThrottle) {
    socket.emit("typing");
    typingThrottle = true;
    window.setTimeout(() => {typingThrottle = false;}, 1000);
  }
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (confirm("確定要清空自己這個分頁的聊天紀錄？")) chatMessages.replaceChildren();
});

document.getElementById("change-name-btn").addEventListener("click", () => {
  const answer = prompt("輸入新名稱（最多 30 個字元）：", username);
  if (answer === null) return;
  const nextName = answer.trim().slice(0, 30);
  if (!nextName || nextName === username) return;
  if (!socket || !socket.connected) {
    updateStatus(false, "請先連線，才能更改名稱");
    return;
  }
  socket.emit("change_username", {newUsername: nextName});
  username = nextName;
  sessionStorage.setItem("chat_username", username);
});

// Small emoji picker (same idea as the supplied single-browser version).
const emojiButton = document.querySelector(".emoji-btn");
emojiButton.addEventListener("click", () => {
  const previousMenu = document.querySelector(".emoji-menu");
  if (previousMenu) {
    previousMenu.remove();
    return;
  }
  const menu = document.createElement("div");
  menu.className = "emoji-menu p-2 bg-white rounded shadow";
  ["😊", "😂", "😍", "👍", "❤️", "😉", "🎉", "👋"].forEach((value) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = value;
    item.style.cssText = "border:0;background:white;font-size:1.35rem;cursor:pointer;margin:2px";
    item.addEventListener("click", () => {
      messageInput.value += value;
      menu.remove();
      messageInput.focus();
    });
    menu.append(item);
  });
  emojiButton.after(menu);
});

if (window.mermaid) {
  mermaid.initialize({startOnLoad: false, securityLevel: "strict"});
}
