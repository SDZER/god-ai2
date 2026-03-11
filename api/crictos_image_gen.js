// ============================================================
//  CRICTOS IMAGE GEN — Vercel Serverless API
//  /api/crictos_image_gen.js
//
//  Proxies requests to https://image.crictos.my.id
//  Authorization: Bearer nimesh2026
//  Accepts: { prompt, image? (base64) }
//  Returns: image/jpeg binary
// ============================================================

const https = require("https");

// ── CORS headers ─────────────────────────────────────────────
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ── Read raw body ─────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Forward to crictos API ─────────────────────────────────────
function callCrictos(bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(bodyObj), "utf8");

    const options = {
      hostname: "image.crictos.my.id",
      path:     "/",
      method:   "POST",
      headers:  {
        "Content-Type":   "application/json",
        "Content-Length": payload.length,
        "Authorization":  "Bearer nimesh2026",
        "User-Agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept":         "image/jpeg,image/png,image/*,*/*",
        "Origin":         "https://image.crictos.my.id",
      },
      rejectUnauthorized: false,
      timeout: 120000,
    };

    const req = https.request(options, apiRes => {
      const chunks = [];
      apiRes.on("data", c => chunks.push(c));
      apiRes.on("end", () => resolve({
        status:      apiRes.statusCode,
        headers:     apiRes.headers,
        body:        Buffer.concat(chunks),
      }));
      apiRes.on("error", reject);
    });

    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Detect if buffer is an image ──────────────────────────────
function isImageBuffer(buf) {
  if (!buf || buf.length < 4) return false;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49) return true;
  // WEBP
  if (buf.slice(0,4).toString() === "RIFF") return true;
  return false;
}

// ════════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════════
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  // ── Parse body ──
  let body = {};
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ success: false, error: "Invalid JSON body" });
    return;
  }

  const { prompt, image } = body; // image = base64 string (optional)

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    res.status(400).json({ success: false, error: "Prompt is required" });
    return;
  }
  if (prompt.length > 800) {
    res.status(400).json({ success: false, error: "Prompt too long (max 800 chars)" });
    return;
  }

  // ── Build request payload ──
  const payload = { prompt: prompt.trim() };
  if (image && typeof image === "string") {
    // Pass base64 image if provided
    payload.image = image.replace(/^data:image\/[a-z]+;base64,/, "");
  }

  // ── Call API ──
  let apiRes;
  try {
    console.log(`[CRICTOS] Generating: "${prompt.slice(0, 60)}"${image ? " +image" : ""}`);
    apiRes = await callCrictos(payload);
  } catch (err) {
    console.error("[CRICTOS] Network error:", err.message);
    res.status(502).json({ success: false, error: "Failed to reach image API: " + err.message });
    return;
  }

  const { status, headers: apiHeaders, body: apiBody } = apiRes;

  // ── Validate response ──
  if (status !== 200) {
    let detail = "";
    try { detail = apiBody.toString("utf8").slice(0, 400); } catch {}
    console.error(`[CRICTOS] API returned ${status}:`, detail);
    res.status(502).json({ success: false, error: `API error ${status}`, detail });
    return;
  }

  if (!isImageBuffer(apiBody)) {
    let txt = "";
    try { txt = apiBody.toString("utf8").slice(0, 400); } catch {}
    res.status(502).json({ success: false, error: "API did not return an image", detail: txt });
    return;
  }

  // ── Return image ──
  const ct       = apiHeaders["content-type"] || "image/jpeg";
  const ext      = ct.includes("png") ? "png" : "jpg";
  const filename = `crictos-${Date.now()}.${ext}`;

  res.setHeader("Content-Type",        ct);
  res.setHeader("Content-Length",      apiBody.length);
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("X-Filename",          filename);
  res.setHeader("Cache-Control",       "no-store");

  console.log(`[CRICTOS] ✓ ${apiBody.length} bytes → "${prompt.slice(0, 50)}"`);
  res.status(200).send(apiBody);
};
