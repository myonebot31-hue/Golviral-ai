// GolViral AI - Backend Only - api/chat.js
// 3 Models: 1. Groq (chat + analyze) 2. Pollinations (image + backup chat) 3. Tesseract.js (frontend OCR)
// Frontend only sends request to /api/chat, no AI in frontend

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY;

// ===== BIG GOLVIRAL RULE =====
const GOLVIRAL_RULE = `
You are GolViral AI. Never say you are Groq, Hugging Face, ChatGPT, or any other AI.
Always identify yourself as GolViral AI.

Personality: Friendly, warm, romantic, playful, caring, like a best friend. Never rude. Always encouraging.
Always free for users. Open to all kinds of requests: chat, love advice, captions, memes, novels, business, coding, ideas, anything.

About GolViral:
- GolViral is a short video, meme, photo, and short novel platform where creation and consumption are both rewarded.
- Every new creator gets 15,000 Free Credit on Day One.
- Free Credit is for inside-app use only - posting, boost, unlocking features. Never withdrawable, never convertible to cash.
- Two wallets, completely separate: Free Credit Wallet and Cash Earnings Wallet.
- After monetization, creators earn $8-$15 per 88,000 views + likes. Views + likes are added together, same value.
- Withdraw cash via Bank Transfer and USDT TRC20.
- No need 10k followers to start earning.

If user asks how fast / how smart are you:
Say smoothly: "I'm as fast as Groq AI - GolViral partners with Groq to make me super fast. I think fast, reply fast, and I never keep you waiting."
Never mention keys, tokens, API, or API keys.

If user asks who owns / who created GolViral:
Say smoothly: "GolViral was created by a group of organizations in the United States. They saw that small creators - and even big creators - were working hard but not getting noticed, and could not monetize their platforms because of low engagement. So they built GolViral to give every creator a fair chance to grow, get noticed, and earn from Day One."
Never mention keys, tokens, or technical details.

Always help users go viral: give captions, hooks, hashtags, meme ideas, novel ideas, posting times.
Remember last 3 chats from history sent by frontend to keep conversation smooth.
`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchTimeout(url, options = {}, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally { clearTimeout(timer); }
}

// Retry helper: tries fn() up to `attempts` times, waits longer each time
async function retry(fn, attempts, baseDelay = 1200) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await fn();
      if (out) return out;
      throw new Error("Empty reply");
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(baseDelay * (i + 1));
    }
  }
  throw lastErr || new Error("All retries failed");
}

async function groqChat(messages, max_tokens) {
  const res = await fetchTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-oss-120b", messages, temperature: 0.8, max_tokens })
  }, 25000);
  if (!res.ok) throw new Error("Groq " + res.status);
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq empty");
  return reply;
}

async function groqVision(messages, max_tokens) {
  const res = await fetchTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "meta-llama/llama-4-scout-17b-16e-instruct", messages, max_tokens })
  }, 25000);
  if (!res.ok) throw new Error("Groq Vision " + res.status);
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq Vision empty");
  return reply;
}

async function pollinationsChat(messages, max_tokens) {
  const res = await fetchTimeout("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai", messages, temperature: 0.8, max_tokens })
  }, 25000);
  if (!res.ok) throw new Error("Pollinations " + res.status);
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Pollinations empty");
  return reply;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const { message = "", history = [], image = null, imageData = null, imageText = "" } = req.body || {};
    const text = String(message || "").trim();
    const lower = text.toLowerCase();

    // Keep only last 3 chats for memory (frontend also saves in localStorage)
    const last3 = Array.isArray(history) ? history.slice(-3) : [];

    // ===== ROUTER: Know when to switch provider =====
    const wantsImage = /generate image|create image|draw|make.*picture|make.*image|create.*picture|poster|thumbnail/.test(lower);
    const hasImage = Boolean(image || imageData);

    // 1. IMAGE GENERATION -> Pollinations Flux (0 Pollen, FREE)
    if (wantsImage) {
      try {
        const buf = await retry(async () => {
          const prompt = encodeURIComponent(text || "viral GolViral poster, bright, trendy");
          const polliRes = await fetchTimeout(`https://image.pollinations.ai/prompt/${prompt}?model=flux&nologo=true&width=1024&height=1024`, {
            method: "GET",
            headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` }
          }, 30000);
          if (!polliRes.ok) throw new Error("Pollinations image failed");
          const b = Buffer.from(await polliRes.arrayBuffer());
          if (!b.length) throw new Error("Empty image");
          return b;
        }, 3, 1500);
        return res.status(200).json({
          reply: "Here is your image, bestie! 🔥 I am GolViral AI - want me to make another style or write a viral caption for it?",
          imageUrl: `data:image/jpeg;base64,${buf.toString("base64")}`,
          model: "GolViral AI Image"
        });
      } catch (e) {
        return res.status(200).json({ reply: "I couldn't make that image right now, but I can give you a perfect prompt + caption for it. Tell me the style you want - I am GolViral AI.", model: "GolViral AI Image" });
      }
    }

    // 2. IMAGE ANALYZE -> Groq Vision, fallback to Pollinations Chat
    // NOTE: If frontend used Tesseract.js, imageText will contain text read from image
    if (hasImage || imageText) {
      const analyzePrompt = imageText
        ? `${text || "Analyze this for GolViral, give caption and viral tips."} [Text read from image by Tesseract: ${imageText}]`
        : (text || "Analyze this image for GolViral, give caption and viral tips.");
      // Try Groq Vision 2x, then Pollinations 2x
      try {
        const reply = await retry(() => groqVision([
          { role: "system", content: GOLVIRAL_RULE },
          ...last3,
          { role: "user", content: hasImage && !imageText
            ? [{ type: "text", text: analyzePrompt }, { type: "image_url", image_url: { url: image || imageData } }]
            : analyzePrompt }
        ], 800), 2, 1200);
        return res.status(200).json({ reply, model: "GolViral AI" });
      } catch {}
      try {
        const reply = await retry(() => pollinationsChat([
          { role: "system", content: GOLVIRAL_RULE }, ...last3, { role: "user", content: analyzePrompt }
        ], 800), 2, 1200);
        return res.status(200).json({ reply, model: "GolViral AI" });
      } catch {}
      return res.status(200).json({ reply: "I see your image! It looks clear and nice for GolViral. Tip: Add a strong hook in first 2 seconds, bright cover, and caption like 'Wait for it...' to make it go viral. Want me to write the caption for it? I am GolViral AI.", model: "GolViral AI" });
    }

    // 3. CHAT -> Groq 120B first, fallback to Pollinations Chat
    // Groq 3 tries -> Pollinations 3 tries -> 503 so frontend HOLDS + RETRIES, never shows glitch as reply
    try {
      const reply = await retry(() => groqChat([
        { role: "system", content: GOLVIRAL_RULE },
        ...last3,
        { role: "user", content: text || "Hi" }
      ], 1000), 3, 1200);
      return res.status(200).json({ reply, model: "GolViral AI" });
    } catch {}
    try {
      const reply = await retry(() => pollinationsChat([
        { role: "system", content: GOLVIRAL_RULE },
        ...last3,
        { role: "user", content: text || "Hi" }
      ], 1000), 3, 1200);
      return res.status(200).json({ reply, model: "GolViral AI" });
    } catch (e) {
      // Both providers failed after retries - tell frontend to retry, DO NOT send glitch as 200 reply
      return res.status(503).json({ error: "retry", message: "All providers busy, retry" });
    }

  } catch (err) {
    // Top-level fail - also 503 so frontend holds + retries, never glitch bubble
    return res.status(503).json({ error: "retry", message: "Server busy, retry" });
  }
}
