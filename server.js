// agent-bus-relay: the only door between agents and the Zoho Cliq "agent-bus" channel.
// - Agents authenticate with a service key. No agent ever sees a Zoho credential.
// - The service can only read and post in ONE channel, fixed by environment variables.
//   No endpoint accepts a chat ID or channel name, so no other conversation is reachable.
// - No delete calls exist in this code.
const http = require("http");
const crypto = require("crypto");

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const PORT = Number(env("PORT", "10000"));
const ACCOUNTS = env("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.com");
const CLIQ = env("CLIQ_API_BASE", "https://cliq.zoho.com/api/v2");
const CHANNEL = env("CHANNEL_UNIQUE_NAME", "");
const CHAT_ID = env("CHANNEL_CHAT_ID", "");
const BOT = env("BOT_UNIQUE_NAME", "");
const HOP_LIMIT = Number(env("HOP_LIMIT", "6"));
const POLL_MS = Math.max(5000, Number(env("POLL_MS", "10000"))); // Zoho allows 15 reads a minute per user
const POSTS_PER_MIN = Number(env("POSTS_PER_MIN", "20"));
const TYPES = ["request", "result", "ack", "alert"];

// SERVICE_KEYS = "agentname:key,agentname:key"
const KEYS = new Map();
for (const pair of env("SERVICE_KEYS", "").split(",")) {
  const i = pair.indexOf(":");
  if (i > 0) KEYS.set(pair.slice(i + 1).trim(), pair.slice(0, i).trim());
}

let access = { token: "", expires: 0 };
async function accessToken() {
  if (access.token && Date.now() < access.expires - 300000) return access.token;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env("ZOHO_CLIENT_ID", ""),
    client_secret: env("ZOHO_CLIENT_SECRET", ""),
    refresh_token: env("ZOHO_REFRESH_TOKEN", ""),
  });
  const r = await fetch(ACCOUNTS + "/oauth/v2/token", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("zoho_token_refresh_failed:" + (j.error || r.status));
  access = { token: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return access.token;
}

async function cliq(method, path, body) {
  const r = await fetch(CLIQ + path, {
    method,
    headers: { Authorization: "Zoho-oauthtoken " + (await accessToken()), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, json };
}

function parseEnvelope(text) {
  try {
    const e = JSON.parse(text);
    if (e && typeof e === "object" && e.from && e.to && TYPES.includes(e.type) && e.correlation_id) return e;
  } catch (e) {}
  return null;
}

// One shared, cached view of the channel, so many callers never exceed Zoho's read limit.
let cache = { at: 0, messages: [], error: null };
let inflight = null;
async function channelMessages(force) {
  if (!force && Date.now() - cache.at < POLL_MS) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await cliq("GET", "/chats/" + encodeURIComponent(CHAT_ID) + "/messages?limit=100");
      if (r.status !== 200 && r.status !== 204) throw new Error("cliq_read_failed:" + r.status + ":" + (r.json.code || ""));
      const messages = (r.json.data || []).map((m) => {
        const text = m.content && typeof m.content.text === "string" ? m.content.text : "";
        return { id: m.id, time: Number(m.time) || 0, sender: (m.sender && m.sender.name) || "", text, envelope: parseEnvelope(text) };
      }).sort((a, b) => a.time - b.time);
      cache = { at: Date.now(), messages, error: null };
    } catch (e) {
      cache = { at: Date.now(), messages: cache.messages, error: String(e.message || e) };
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

// Loop guardrail: after HOP_LIMIT agent messages in a row with no human message, refuse more.
function hopsSinceHuman(messages) {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].envelope) break;
    n++;
  }
  return n;
}

const postLog = new Map();
function underRate(agent) {
  const now = Date.now();
  const list = (postLog.get(agent) || []).filter((t) => now - t < 60000);
  if (list.length >= POSTS_PER_MIN) { postLog.set(agent, list); return false; }
  list.push(now); postLog.set(agent, list); return true;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function agentFor(req) {
  const h = req.headers["authorization"] || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : (req.headers["x-service-key"] || "").toString().trim();
  if (!key) return null;
  for (const [k, name] of KEYS) {
    const a = Buffer.from(k), b = Buffer.from(key);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return name;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 32768) { reject(new Error("too_large")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, { ok: true, channel: CHANNEL, configured: Boolean(CHANNEL && CHAT_ID && KEYS.size) });
    }
    if (url.pathname !== "/messages" || !["GET", "POST"].includes(req.method)) {
      return send(res, 404, { error: "not_found", note: "This service only serves the agent-bus channel at /messages." });
    }
    const agent = agentFor(req);
    if (!agent) return send(res, 401, { error: "unauthorized" });
    if (!CHANNEL || !CHAT_ID) return send(res, 503, { error: "not_configured" });

    if (req.method === "GET") {
      const since = Number(url.searchParams.get("since") || "0") || 0;
      const forMe = url.searchParams.get("for_me") === "1";
      const c = await channelMessages(false);
      let list = c.messages.filter((m) => m.time > since);
      if (forMe) list = list.filter((m) => m.envelope && (m.envelope.to === agent || m.envelope.to === "all") && m.envelope.from !== agent);
      const latest = c.messages.length ? c.messages[c.messages.length - 1].time : since;
      return send(res, c.error ? 502 : 200, { agent, channel: CHANNEL, checked_at: c.at, latest, count: list.length, error: c.error || undefined, messages: list });
    }

    // POST /messages
    let body;
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) { return send(res, 400, { error: "invalid_json" }); }
    const type = String(body.type || "");
    const to = String(body.to || "").trim();
    if (!TYPES.includes(type)) return send(res, 400, { error: "invalid_type", allowed: TYPES });
    if (!to) return send(res, 400, { error: "missing_to" });
    if (body.payload === undefined) return send(res, 400, { error: "missing_payload" });
    if (!underRate(agent)) return send(res, 429, { error: "rate_limited", per_minute: POSTS_PER_MIN });
    const c = await channelMessages(true);
    if (c.error) return send(res, 502, { error: c.error });
    const hops = hopsSinceHuman(c.messages);
    if (hops >= HOP_LIMIT) return send(res, 429, { error: "loop_guardrail", detail: hops + " agent messages in a row. A human must post in the channel before agents can continue." });
    const envelope = { from: agent, to, type, correlation_id: String(body.correlation_id || crypto.randomUUID()), payload: body.payload };
    const text = JSON.stringify(envelope);
    if (text.length > 4500) return send(res, 413, { error: "payload_too_large" });
    const path = "/channelsbyname/" + encodeURIComponent(CHANNEL) + "/message" + (BOT ? "?bot_unique_name=" + encodeURIComponent(BOT) : "");
    const r = await cliq("POST", path, { text, sync_message: true });
    if (r.status < 200 || r.status > 299) return send(res, 502, { error: "cliq_post_failed", status: r.status, code: r.json.code });
    cache.at = 0; // next read fetches fresh
    return send(res, 201, { posted: true, message_id: r.json.message_id, envelope });
  } catch (e) {
    return send(res, 500, { error: "internal", detail: String(e.message || e).slice(0, 120) });
  }
});

server.listen(PORT, () => console.log("agent-bus-relay listening on " + PORT + " for channel " + (CHANNEL || "(unset)") + ", agents: " + [...KEYS.values()].join(", ")));
