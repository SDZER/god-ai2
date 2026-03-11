// =====================================================
//  CRICTOS AI — /api/crictos_image_gen.js
//  Vercel Serverless Function
//  Proxies to https://image.crictos.my.id
//  Authorization: Bearer nimesh2026
//  No npm dependencies — pure Node.js built-ins only
// =====================================================

const https = require("https");

// ── CORS ──────────────────────────────────────────────
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ── Read request body ──────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Call Crictos API ───────────────────────────────────
function callCrictos(payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload), "utf8");

    const options = {
      hostname: "image.crictos.my.id",
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
        "Authorization": "Bearer nimesh2026",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*",
        "Origin": "https://image.crictos.my.id",
        "Referer": "https://image.crictos.my.id/",
      },
      rejectUnauthorized: false,
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      );
      res.on("error", reject);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Crictos API request timed out"));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ── Is image buffer? ───────────────────────────────────
function isImage(buf) {
  if (!buf || buf.length < 4) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf[0] === 0x47 && buf[1] === 0x49) return true; // GIF
  if (buf.slice(0, 4).toString() === "RIFF") return true; // WEBP
  return false;
}

// ═════════════════════════════════════════════════════
//  MAIN HANDLER
// ═════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  cors(res);

  // Preflight
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Only POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Parse body
  let body = {};
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { prompt, image } = body;

  if (!prompt || !String(prompt).trim()) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  if (prompt.length > 800) {
    res.status(400).json({ error: "Prompt too long (max 800 chars)" });
    return;
  }

  // Build payload
  const payload = { prompt: String(prompt).trim() };
  if (image && typeof image === "string") {
    payload.image = image.replace(/^data:image\/[a-z]+;base64,/, "");
  }

  // Call API
  let apiRes;
  try {
    apiRes = await callCrictos(payload);
  } catch (err) {
    console.error("[CRICTOS] Network error:", err.message);
    res.status(502).json({ error: "Failed to reach Crictos API: " + err.message });
    return;
  }

  if (apiRes.status !== 200) {
    let detail = "";
    try { detail = apiRes.body.toString("utf8").slice(0, 300); } catch {}
    console.error(`[CRICTOS] API ${apiRes.status}:`, detail);
    res.status(502).json({ error: `Crictos API returned ${apiRes.status}`, detail });
    return;
  }

  if (!isImage(apiRes.body)) {
    let detail = "";
    try { detail = apiRes.body.toString("utf8").slice(0, 300); } catch {}
    res.status(502).json({ error: "API did not return an image", detail });
    return;
  }

  const ct = apiRes.headers["content-type"] || "image/jpeg";
  res.setHeader("Content-Type", ct);
  res.setHeader("Content-Length", apiRes.body.length);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(apiRes.body);

  console.log(`[CRICTOS] ✓ ${apiRes.body.length}b — "${prompt.slice(0, 50)}"`);
};
