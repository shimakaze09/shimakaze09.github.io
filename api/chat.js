const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "DEEPSEEK_API_KEY is not configured" });
  }

  const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  try {
    const upstream = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return res.status(upstream.status).json({ error: errorText || "DeepSeek request failed" });
    }

    const isStream = payload.stream === true;
    if (!isStream) {
      const data = await upstream.json();
      return res.status(200).json(data);
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    if (!upstream.body) {
      return res.status(502).json({ error: "Upstream stream was empty" });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      res.write(decoder.decode(value, { stream: true }));
    }

    return res.end();
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
};
