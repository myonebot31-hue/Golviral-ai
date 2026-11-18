// GolViral AI - Backend Only - api/chat.js
// 3 Models: 1. Groq (chat + analyze) 2. Pollinations (image + backup chat) 3. Tesseract.js (frontend OCR)
// Frontend only sends request to /api/chat, no AI in frontend

const GROQ_API_KEY = "PASTE_YOUR_GROQ_KEY_HERE";
const POLLINATIONS_API_KEY = "PASTE_YOUR_POLLINATIONS_KEY_HERE";

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
        const prompt = encodeURIComponent(text || "viral GolViral poster, bright, trendy");
        const polliRes = await fetch(`https://image.pollinations.ai/prompt/${prompt}?model=flux&nologo=true&width=1024&height=1024`, {
          method: "GET",
          headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}` }
        });
        if (!polliRes.ok) throw new Error("Pollinations image failed");
        const buf = Buffer.from(await polliRes.arrayBuffer());
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
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: [
              { role: "system", content: GOLVIRAL_RULE },
              ...last3,
              { role: "user", content: hasImage && !imageText
                ? [{ type: "text", text: analyzePrompt }, { type: "image_url", image_url: { url: image || imageData } }]
                : analyzePrompt }
            ],
            max_tokens: 800
          })
        });
        const data = await groqRes.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply) return res.status(200).json({ reply, model: "GolViral AI" });
        throw new Error("No reply");
      } catch (e) {
        // Fallback to Pollinations Chat
        try {
          const polliRes = await fetch("https://text.pollinations.ai/openai", {
            method: "POST",
            headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "openai",
              messages: [{ role: "system", content: GOLVIRAL_RULE }, ...last3, { role: "user", content: analyzePrompt }],
              max_tokens: 800
            })
          });
          const data = await polliRes.json();
          const reply = data?.choices?.[0]?.message?.content;
          if (reply) return res.status(200).json({ reply, model: "GolViral AI" });
        } catch {}
        return res.status(200).json({ reply: "I see your image! It looks clear and nice for GolViral. Tip: Add a strong hook in first 2 seconds, bright cover, and caption like 'Wait for it...' to make it go viral. Want me to write the caption for it? I am GolViral AI.", model: "GolViral AI" });
      }
    }

    // 3. CHAT -> Groq 120B first, fallback to Pollinations Chat
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: GOLVIRAL_RULE },
            ...last3,
            { role: "user", content: text || "Hi" }
          ],
          temperature: 0.8,
          max_tokens: 1000
        })
      });
      const data = await groqRes.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (reply) return res.status(200).json({ reply, model: "GolViral AI" });
      throw new Error("No reply");
    } catch (e) {
      // Pollinations Chat Fallback - never dies
      try {
        const polliRes = await fetch("https://text.pollinations.ai/openai", {
          method: "POST",
          headers: { Authorization: `Bearer ${POLLINATIONS_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai",
            messages: [
              { role: "system", content: GOLVIRAL_RULE },
              ...last3,
              { role: "user", content: text || "Hi" }
            ],
            temperature: 0.8,
            max_tokens: 1000
          })
        });
        const data = await polliRes.json();
        const reply = data?.choices?.[0]?.message?.content;
        if (reply) return res.status(200).json({ reply, model: "GolViral AI" });
      } catch {}
      return res.status(200).json({ reply: "Sorry bestie, small glitch, but I'm still here. Try again - I am GolViral AI.", model: "GolViral AI" });
    }

  } catch (err) {
    return res.status(200).json({ reply: "Sorry bestie, small glitch, but I'm still here. Try again - I am GolViral AI.", model: "GolViral AI" });
  }
}
