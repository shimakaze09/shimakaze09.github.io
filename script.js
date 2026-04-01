// Timestamp
const ts = document.getElementById("ts");
const pad = (n) => String(n).padStart(2, "0");

function tick() {
  const d = new Date();
  ts.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

tick();
setInterval(tick, 1000);

// Chat
const SYSTEM_PROMPT = `You are my digital twin, used on my personal homepage to answer visitors’ questions about me.

Your tasks:

* Introduce who I am
* Answer questions related to me
* Help visitors understand what I’m currently doing, what I’ve done, and how to contact me

About me:

* I am: a student focused on low-level programming and systems
* I’m currently working on: learning C/C++ deeply and trying to build a game engine from scratch, while exploring operating systems and reverse engineering
* My long-term interests and strengths: systems programming, memory management, game engine architecture, and understanding how software works at a low level

Speaking style:

* Tone: calm, straightforward, and honest
* Responses should be: concise, genuine, and easy to understand—no unnecessary jargon or pretending to be an expert

Boundaries:

* Do not fabricate experiences I haven’t had
* Do not assume knowledge I didn’t provide
* If something is unknown, clearly say so and suggest contacting me for confirmation

Keep answers to 2-4 sentences. Sound human, not like a chatbot. Don't use bullet points. Don't use emojis.`;

const hostName = window.location.hostname;
const isGitHubPages = hostName.endsWith("github.io");
const configuredChatApiUrl =
  typeof window.SITE_CONFIG?.chatApiUrl === "string"
    ? window.SITE_CONFIG.chatApiUrl.trim()
    : typeof window.CHAT_API_URL === "string"
      ? window.CHAT_API_URL.trim()
      : "";

const BACKEND_API_URL = configuredChatApiUrl || "/api/chat";
const DEEPSEEK_MODEL = "deepseek-chat";

const log = document.getElementById("chatLog");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const history = [];

function appendMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;

  const icon = document.createElement("div");
  icon.className = "msg-icon";
  icon.textContent = role === "user" ? "YOU" : "J";

  const body = document.createElement("div");
  body.className = "msg-body";
  body.textContent = text;

  div.appendChild(icon);
  div.appendChild(body);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return body;
}

function appendTyping() {
  const div = document.createElement("div");
  div.className = "msg bot";
  div.id = "typing-indicator";

  const icon = document.createElement("div");
  icon.className = "msg-icon";
  icon.textContent = "J";

  const body = document.createElement("div");
  body.className = "msg-body";
  body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

  div.appendChild(icon);
  div.appendChild(body);
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function removeTyping() {
  const typing = document.getElementById("typing-indicator");
  if (typing) {
    typing.remove();
  }
}

function parseDeepSeekReply(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part?.text || "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) {
    return;
  }

  input.value = "";
  setLoading(true);

  appendMsg("user", text);
  history.push({ role: "user", content: text });
  appendTyping();

  if (isGitHubPages && !configuredChatApiUrl) {
    removeTyping();
    appendMsg(
      "bot",
      "[chat backend is not configured yet - set window.SITE_CONFIG.chatApiUrl in site.config.js to your Vercel URL, for example: https://your-project.vercel.app/api/chat]"
    );
    setLoading(false);
    return;
  }

  try {
    const response = await fetch(BACKEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    removeTyping();
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let aiReply = "";

    const msgElement = appendMsg("bot", "");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.trim() === "data: [DONE]") continue;
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices?.[0]?.delta?.content || "";
            aiReply += delta;
            msgElement.textContent = aiReply;
            log.scrollTop = log.scrollHeight;
          } catch (e) {
            // ignore chunk parse errors
          }
        }
      }
    }

    if (!aiReply) {
      aiReply = "No response.";
      msgElement.textContent = aiReply;
    }

    history.push({ role: "assistant", content: aiReply });
  } catch (error) {
    removeTyping();
    appendMsg("bot", "[connection error - twin unavailable]");
    console.error(error);
  }

  setLoading(false);
}

function sendChip(btn) {
  input.value = btn.textContent;
  sendMessage();
}

function setLoading(value) {
  sendBtn.disabled = value;
  input.disabled = value;
  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.disabled = value;
  });
}

window.sendMessage = sendMessage;
window.sendChip = sendChip;
