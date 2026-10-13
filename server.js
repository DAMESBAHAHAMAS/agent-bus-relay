// agent-bus-relay v2: the only door between agents and the Zoho Cliq "agent-bus" channel.
// - Agents authenticate with a service key. No agent ever sees a Zoho credential.
// - ONE channel only, fixed by environment variables. No endpoint accepts a chat ID or channel name.
// - Push: a recipient waiting on /wait is released the instant a message for it is posted.
// - Acknowledgment: every request is tracked until the RECIPIENT ITSELF replies. Silence is
//   re-notified, then reported in the channel. The relay never acknowledges on anyone's behalf.
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
const POLL_MS = Math.max(5000, Number(env("POLL_MS", "10000")));
const POSTS_PER_MIN = Number(env("POSTS_PER_MIN", "20"));
const ACK_REMIND_MS = Number(env("ACK_REMIND_S", "120")) * 1000;
const ACK_ESCALATE_MS = Number(env("ACK_ESCALATE_S", "600")) * 1000;
const READS_PER_MIN = 12; // Zoho allows 15 a minute per user; stay under it
const TYPES = ["request", "result", "ack", "alert"];
const RELAY = "relay";

const KEYS = new Map(); // key -> agent name.  SERVICE_KEYS = "agent:key,agent:key"
for (const pair of env("SERVICE_KEYS", "").split(",")) {
  const i = pair.indexOf(":");
  if (i > 0) KEYS.set(pair.slice(i + 1).trim(), pair.slice(0, i).trim());
}
const AGENTS = new Set(KEYS.values());

const HOOKS = new Map(); // optional: AGENT_WEBHOOKS = "agent|https://url|secret;agent|https://url|secret"
for (const row of env("AGENT_WEBHOOKS", "").split(";")) {
  const p = row.split("|");
  if (p.length === 3 && p[1].startsWith("https://")) HOOKS.set(p[0].trim(), { url: p[1].trim(), secret: p[2].trim() });
}

let access = { token: "", expires: 0 };
async function accessToken() {
  if (access.token && Date.now() < access.expires - 300000) return access.token;
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: env("ZOHO_CLIENT_ID", ""),
    client_secret: env("ZOHO_CLIENT_SECRET", ""), refresh_token: env("ZOHO_REFRESH_TOKEN", "") });
  const r = await fetch(ACCOUNTS + "/oauth/v2/token", { method: "POST", body });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("zoho_token_refresh_failed:" + (j.error || r.status));
  access = { token: j.access_token, expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return access.token;
}

async function cliq(method, path, body) {
  const r = await fetch(CLIQ + path, { method,
    headers: { Authorization: "Zoho-oauthtoken " + (await accessToken()), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined });
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

// ---- one shared, cached view of the channel ----
let cache = { at: 0, messages: [], error: null };
let inflight = null;
let reads = [];
let lastNotified = Date.now();
async function channelMessages(maxAgeMs) {
  if (Date.now() - cache.at < maxAgeMs) return cache;
  reads = reads.filter((t) => Date.now() - t < 60000);
  if (reads.length >= READS_PER_MIN && cache.at) return cache; // protect Zoho's read limit
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      reads.push(Date.now());
      const r = await cliq("GET", "/chats/" + encodeURIComponent(CHAT_ID) + "/messages?limit=100");
      if (r.status !== 200 && r.status !== 204) throw new Error("cliq_read_failed:" + r.status + ":" + (r.json.code || ""));
      const messages = (r.json.data || []).map((m) => {
        const text = m.content && typeof m.content.text === "string" ? m.content.text : "";
        return { id: m.id, time: Number(m.time) || 0, sender: (m.sender && m.sender.name) || "", text, envelope: parseEnvelope(text) };
      }).sort((a, b) => a.time - b.time);
      cache = { at: Date.now(), messages, error: null };
      // wake anyone waiting on messages that arrived by another route (for example typed in Cliq)
      for (const m of messages) if (m.time > lastNotified && m.envelope) notify(m);
      if (messages.length) lastNotified = Math.max(lastNotified, messages[messages.length - 1].time);
    } catch (e) {
      cache = { at: Date.now(), messages: cache.messages, error: String(e.message || e) };
    } finally { inflight = null; }
    return cache;
  })();
  return inflight;
}

// ---- loop guardrail: agent messages in a row since the last human message (relay notices do not count) ----
function hopsSinceHuman(messages) {
  let n = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const e = messages[i].envelope;
    if (!e) break;
    if (e.from !== RELAY) n++;
  }
  return n;
}

// ---- acknowledgment ledger, derived from the channel itself so it survives restarts ----
function ledger(messages) {
  const out = [];
  for (const m of messages) {
    const e = m.envelope;
    if (!e || e.type !== "request" || e.to === "all" || e.from === RELAY) continue;
    const ack = messages.find((x) => x.envelope && x.time >= m.time && x.envelope.correlation_id === e.correlation_id &&
      x.envelope.from === e.to && (x.envelope.type === "ack" || x.envelope.type === "result"));
    const escalated = messages.some((x) => x.envelope && x.envelope.from === RELAY && x.envelope.correlation_id === e.correlation_id);
    out.push({ correlation_id: e.correlation_id, from: e.from, to: e.to, requested_at: m.time, message_id: m.id,
      state: ack ? "acknowledged" : escalated ? "escalated" : "pending", acknowledged_at: ack ? ack.time : null,
      acknowledged_by: ack ? ack.envelope.from : null, waiting_seconds: ack ? Math.round((ack.time - m.time) / 1000) : Math.round((Date.now() - m.time) / 1000) });
  }
  return out;
}
const forAgent = (m, agent) => m.envelope && (m.envelope.to === agent || m.envelope.to === "all") && m.envelope.from !== agent;
const pendingFor = (messages, agent) => ledger(messages).filter((r) => r.to === agent && r.state !== "acknowledged");

// ---- push: release waiters, and call a webhook if the agent has one ----
const waiters = new Map(); // agent -> Set(fn)
const pushLog = new Map(); // message id -> { agent: result }
function notify(m) {
  const targets = m.envelope.to === "all" ? [...AGENTS].filter((a) => a !== m.envelope.from) : [m.envelope.to];
  for (const agent of targets) {
    const set = waiters.get(agent);
    const live = set ? set.size : 0;
    if (set) for (const fn of [...set]) fn();
    const log = pushLog.get(m.id) || {};
    log[agent] = live ? "delivered_to_waiting_listener" : (log[agent] || "queued_until_agent_checks");
    pushLog.set(m.id, log);
    const hook = HOOKS.get(agent);
    if (hook) {
      const body = JSON.stringify({ message_id: m.id, time: m.time, envelope: m.envelope });
      const sig = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      fetch(hook.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Bus-Signature": "sha256=" + sig }, body, signal: AbortSignal.timeout(8000) })
        .then((r) => { log[agent] = "webhook_http_" + r.status; }).catch(() => { log[agent] = "webhook_unreachable"; });
    }
  }
  if (pushLog.size > 500) pushLog.delete(pushLog.keys().next().value);
}

async function postEnvelope(envelope) {
  const text = JSON.stringify(envelope);
  const path = "/channelsbyname/" + encodeURIComponent(CHANNEL) + "/message" + (BOT ? "?bot_unique_name=" + encodeURIComponent(BOT) : "");
  const r = await cliq("POST", path, { text, sync_message: true });
  if (r.status < 200 || r.status > 299) return { ok: false, status: r.status, code: r.json.code };
  const m = { id: decodeURIComponent(String(r.json.message_id || crypto.randomUUID())).replace(" ", "_"), time: Date.now(), sender: "", text, envelope };
  cache.messages.push(m); // keep our view current without spending a read
  lastNotified = Math.max(lastNotified, m.time);
  notify(m);
  return { ok: true, message: m };
}

// ---- the watchdog: re-notify silent recipients, then report them in the channel ----
const reminded = new Set();
const escalating = new Set();
async function watchdog() {
  try {
    if (!CHANNEL || !CHAT_ID) return;
    const c = await channelMessages(15000);
    for (const r of ledger(c.messages)) {
      if (r.state === "acknowledged") continue;
      const age = Date.now() - r.requested_at;
      const req = c.messages.find((m) => m.id === r.message_id);
      if (age > ACK_REMIND_MS && !reminded.has(r.correlation_id) && req) { reminded.add(r.correlation_id); notify(req); }
      if (age > ACK_ESCALATE_MS && r.state === "pending" && !escalating.has(r.correlation_id)) {
        escalating.add(r.correlation_id);
        await postEnvelope({ from: RELAY, to: r.from, type: "alert", correlation_id: r.correlation_id,
          payload: "NO ACKNOWLEDGMENT: " + r.to + " has not acknowledged the request from " + r.from + " after " + Math.round(age / 60000) + " minutes." });
      }
    }
  } catch (e) {}
}
setInterval(watchdog, 20000);

const postLog = new Map();
function underRate(agent) {
  const now = Date.now();
  const list = (postLog.get(agent) || []).filter((t) => now - t < 60000);
  if (list.length >= POSTS_PER_MIN) { postLog.set(agent, list); return false; }
  list.push(now); postLog.set(agent, list); return true;
}
function send(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
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
function inbox(c, agent, since, onlyMine) {
  let list = c.messages.filter((m) => m.time > since);
  if (onlyMine) list = list.filter((m) => forAgent(m, agent));
  const latest = c.messages.length ? c.messages[c.messages.length - 1].time : since;
  return { agent, channel: CHANNEL, checked_at: c.at, latest, count: list.length, error: c.error || undefined,
    messages: list, pending_acks: pendingFor(c.messages, agent) };
}

const ROUTES = { "/messages": ["GET", "POST"], "/wait": ["GET"], "/status": ["GET"], "/pending": ["GET"] };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, { ok: true, version: 2, channel: CHANNEL, configured: Boolean(CHANNEL && CHAT_ID && KEYS.size) });
    }
    if (!ROUTES[url.pathname] || !ROUTES[url.pathname].includes(req.method)) {
      return send(res, 404, { error: "not_found", note: "This service only serves the agent-bus channel." });
    }
    const agent = agentFor(req);
    if (!agent) return send(res, 401, { error: "unauthorized" });
    if (!CHANNEL || !CHAT_ID) return send(res, 503, { error: "not_configured" });
    const since = Number(url.searchParams.get("since") || "0") || 0;

    if (url.pathname === "/messages" && req.method === "GET") {
      const c = await channelMessages(POLL_MS);
      return send(res, c.error ? 502 : 200, inbox(c, agent, since, url.searchParams.get("for_me") === "1"));
    }

    if (url.pathname === "/wait") { // push: returns the moment a message for this agent arrives
      const timeout = Math.min(25, Math.max(1, Number(url.searchParams.get("timeout") || "25"))) * 1000;
      const c = await channelMessages(POLL_MS);
      if (inbox(c, agent, since, true).count) return send(res, 200, inbox(c, agent, since, true));
      await new Promise((resolve) => {
        const set = waiters.get(agent) || new Set();
        waiters.set(agent, set);
        const done = () => { clearTimeout(timer); set.delete(done); resolve(); };
        const timer = setTimeout(done, timeout);
        set.add(done);
        req.on("close", done);
      });
      return send(res, 200, inbox(cache, agent, since, true));
    }

    if (url.pathname === "/status") {
      const cid = String(url.searchParams.get("correlation_id") || "");
      const c = await channelMessages(POLL_MS);
      const row = ledger(c.messages).find((r) => r.correlation_id === cid);
      if (!row) return send(res, 404, { error: "unknown_correlation_id" });
      return send(res, 200, Object.assign({}, row, { delivery: pushLog.get(row.message_id) || {} }));
    }

    if (url.pathname === "/pending") {
      const c = await channelMessages(POLL_MS);
      return send(res, 200, { pending: ledger(c.messages).filter((r) => r.state !== "acknowledged") });
    }

    // POST /messages
    let body;
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) { return send(res, 400, { error: "invalid_json" }); }
    const type = String(body.type || "");
    const to = String(body.to || "").trim();
    if (!TYPES.includes(type)) return send(res, 400, { error: "invalid_type", allowed: TYPES });
    if (!to) return send(res, 400, { error: "missing_to" });
    if (to !== "all" && !AGENTS.has(to)) return send(res, 400, { error: "unknown_recipient", known: [...AGENTS] });
    if (body.payload === undefined) return send(res, 400, { error: "missing_payload" });
    if (!underRate(agent)) return send(res, 429, { error: "rate_limited", per_minute: POSTS_PER_MIN });
    const c = await channelMessages(3000);
    if (c.error) return send(res, 502, { error: c.error });
    const hops = hopsSinceHuman(c.messages);
    // an acknowledgment of an open request is always allowed through, so the guardrail can never hide a reply
    const isAckOfOpen = (type === "ack" || type === "result") && ledger(c.messages).some((r) => r.correlation_id === String(body.correlation_id) && r.to === agent && r.state !== "acknowledged");
    if (hops >= HOP_LIMIT && !isAckOfOpen) return send(res, 429, { error: "loop_guardrail", detail: hops + " agent messages in a row. A human must post in the channel before agents can continue." });
    const envelope = { from: agent, to, type, correlation_id: String(body.correlation_id || crypto.randomUUID()), payload: body.payload };
    if (JSON.stringify(envelope).length > 4500) return send(res, 413, { error: "payload_too_large" });
    const r = await postEnvelope(envelope);
    if (!r.ok) return send(res, 502, { error: "cliq_post_failed", status: r.status, code: r.code });
    return send(res, 201, { posted: true, message_id: r.message.id, envelope, delivery: pushLog.get(r.message.id) || {},
      ack_required: type === "request" && to !== "all" });
  } catch (e) {
    return send(res, 500, { error: "internal", detail: String(e.message || e).slice(0, 120) });
  }
});
server.listen(PORT, () => console.log("agent-bus-relay v2 on " + PORT + ", channel " + (CHANNEL || "(unset)") + ", agents: " + [...AGENTS].join(", ")));
