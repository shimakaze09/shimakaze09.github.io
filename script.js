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

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_RUNTIME_KEY =
  window.DEEPSEEK_API_KEY ||
  window.DEEP_SEEK_API_KEY ||
  localStorage.getItem("deepseek_api_key") ||
  localStorage.getItem("deep_seek_api_key") ||
  "";

let cachedDeepSeekApiKey;

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseDeepSeekKeyFromEnv(envText) {
  const lines = envText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (key === "DEEPSEEK_API_KEY" || key === "DEEP_SEEK_API_KEY") {
      const value = stripWrappingQuotes(rawValue);
      if (value) {
        return value;
      }
    }
  }
  return "";
}

async function resolveDeepSeekApiKey() {
  if (cachedDeepSeekApiKey !== undefined) {
    return cachedDeepSeekApiKey;
  }

  if (DEEPSEEK_RUNTIME_KEY) {
    cachedDeepSeekApiKey = DEEPSEEK_RUNTIME_KEY;
    return cachedDeepSeekApiKey;
  }

  try {
    const envResponse = await fetch(".env", { cache: "no-store" });
    if (envResponse.ok) {
      const envText = await envResponse.text();
      const envKey = parseDeepSeekKeyFromEnv(envText);
      if (envKey) {
        cachedDeepSeekApiKey = envKey;
        return cachedDeepSeekApiKey;
      }
    }
  } catch {
    // Ignore .env loading errors and fall back to missing-key message.
  }

  cachedDeepSeekApiKey = "";
  return cachedDeepSeekApiKey;
}

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

  const deepSeekApiKey = await resolveDeepSeekApiKey();

  if (!deepSeekApiKey) {
    removeTyping();
    appendMsg(
      "bot",
      "[missing DeepSeek API key - set window.DEEPSEEK_API_KEY, localStorage.deepseek_api_key, or make sure .env is accessible by your web server]"
    );
    setLoading(false);
    return;
  }

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepSeekApiKey}`,
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
