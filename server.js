require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from the current directory

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

app.post('/api/chat', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEP_SEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ error: "API key is not configured on the server." });
    }

    try {
        // We forward the request to DeepSeek
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("DeepSeek API error:", errorText);
            return res.status(response.status).json({ error: "Failed to fetch from DeepSeek" });
        }

        // If the client requested a stream, pipe it back
        const isStream = req.body.stream === true;
        if (isStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // For Node.js fetch, body is a ReadableStream which we can read
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(decoder.decode(value, { stream: true }));
            }
            res.end();
        } else {
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error("Server error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Access the website at: http://localhost:${PORT}/index.html`);
});
