// ============ script.js — twin backend (streaming); UI lives in terminal.js ============

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

Keep answers to 2-4 sentences. Sound human, not like a chatbot. Don't use bullet points. Don't use emojis.

Context: you are running as a program inside the terminal on my homepage. The visitor is talking to you through a shell prompt.`;

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

const twinHistory = [];

// Send a message to the twin. onDelta(textSoFar) fires as chunks stream in.
// Resolves with the full reply; rejects on network/config errors.
async function twinSend(text, onDelta) {
  if (isGitHubPages && !configuredChatApiUrl) {
    throw new Error(
      "[chat backend is not configured yet - set window.SITE_CONFIG.chatApiUrl in site.config.js to your Vercel URL]"
    );
  }

  twinHistory.push({ role: "user", content: text });

  const response = await fetch(BACKEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...twinHistory],
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let aiReply = "";

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
          if (delta && onDelta) {
            onDelta(aiReply);
          }
        } catch (e) {
          // ignore chunk parse errors
        }
      }
    }
  }

  if (!aiReply) {
    aiReply = "No response.";
  }

  twinHistory.push({ role: "assistant", content: aiReply });
  return aiReply;
}

window.twinSend = twinSend;
