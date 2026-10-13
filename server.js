// agent-bus-relay v3: the only door between agents and the Zoho Cliq "agent-bus" channel.
//
// What it guarantees, in code:
//  1. Credentials  - agents hold a service key only. No Zoho credential ever leaves this service.
//  2. Private data - ONE channel only, fixed by environment variables. No endpoint accepts a chat ID.
//  3. Authority    - outside agents may only send requests to the front-door agent. Everything else is refused.
//  4. Identity     - "from" is set from the caller's key, and every message is signed. Unsigned text in the
//                    channel is never treated as an agent message.
//  5. Leakage      - secrets are refused on every message; identity and payment numbers are refused toward outside agents.
//  6. Loops, cost  - per-agent rate limit, and a hop limit that only a human message resets.
//  7. Audit        - every exchange and every refusal is visible in the channel and in /audit.
//  Acknowledgment  - every request is tracked until the RECIPIENT ITSELF replies. The relay never
//                    acknowledges for anyone. Silence is re-notified, then reported in the channel.
//  No delete calls exist in this code.
const http = require("http");
const crypto = require("crypto");

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const list = (k) => env(k, "").split(",").map((s) => s.trim()).filter(Boolean);
const PORT = Number(env("PORT", "10000"));
const ACCOUNTS = env("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.com");
const CLIQ = env("CLIQ_API_BASE", "https://cliq.zoho.com/api/v2");
const CHANNEL = env("CHANNEL_UNIQUE_NAME", "");
const CHAT_ID = env("CHANNEL_CHAT_ID", "");
const BOT = env("BOT_UNIQUE_NAME", "");
const ALERT_BOT = env("ALERT_BOT", "");            // bot that messages Damian directly, so his phone is notified
const ALERT_USER_IDS = env("ALERT_USER_IDS", "");  // his Cliq user id
const SIGNING = env("BUS_SIGNING_SECRET", "");
const HOP_LIMIT = Number(env("HOP_LIMIT", "30"));
const LOOP_WINDOW_MS = Number(env("LOOP_WINDOW_MIN", "60")) * 60000;
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
const EXTERNAL = new Set(list("EXTERNAL_AGENTS"));   // agents outside Damian's business functions
const FRONT_DOOR = env("FRONT_DOOR", "bizops");      // the only agent an outside agent may send a request to
const ADMINS = new Set(list("ADMIN_AGENTS"));        // may read /audit
const isExternal = (a) => EXTERNAL.has(a);

// ---------- signing ----------
const canon = (e) => JSON.stringify([e.from, e.to, e.type, e.correlation_id, e.ts, JSON.stringify(e.payload)]);
const sign = (e) => crypto.createHmac("sha256", SIGNING).update(canon(e)).digest("hex");
function parseEnvelope(text) {
  try {
    const e = JSON.parse(text);
    if (!e || typeof e !== "object" || !e.from || !e.to || !TYPES.includes(e.type) || !e.correlation_id || !e.sig) return null;
    const a = Buffer.from(String(e.sig)), b = Buffer.from(sign(e));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; // forged or altered: not an agent message
    return e;
  } catch (e) { return null; }
}

// ---------- leak filter ----------
const SECRET_PATTERNS = [
  [/\b1000\.[0-9a-f]{20,}\.[0-9a-f]{20,}\b/i, "a Zoho token or grant code"],
  [/\b[0-9a-f]{40,}\b/i, "a long key or token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\b(rnd|ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, "an API key"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "a cloud access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{24,}/i, "a bearer token"],
  [/\b(password|passwd|client_secret|refresh_token|api[_-]?key)\s*[:=]\s*["']?(?=[A-Za-z0-9._\/+-]*\d)[A-Za-z0-9._\/+-]{12,}/i, "a credential"],
];
function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
function leakReason(text, towardExternal) {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what;
  if (towardExternal) {
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return "a Social Security number";
    if (/\b\d{2}-\d{7}\b/.test(text)) return "an employer identification number";
    for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) { const d = m[0].replace(/\D/g, ""); if (d.length >= 13 && d.length <= 19 && luhn(d)) return "a payment card number"; }
  }
  return null;
}

// ---------- Zoho ----------
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

// ---------- audit trail (in memory; the channel itself is the permanent record) ----------
const events = [];
function audit(kind, detail) { events.push(Object.assign({ at: Date.now(), kind }, detail)); if (events.length > 400) events.shift(); }

// ---------- one shared, cached view of the channel ----------
let cache = { at: 0, messages: [], error: null };
let inflight = null;
let reads = [];
let lastNotified = Date.now();
async function channelMessages(maxAgeMs) {
  if (Date.now() - cache.at < maxAgeMs) return cache;
  reads = reads.filter((t) => Date.now() - t < 60000);
  if (reads.length >= READS_PER_MIN && cache.at) return cache;
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
      for (const m of messages) if (m.time > lastNotified && m.envelope) notify(m);
      if (messages.length) lastNotified = Math.max(lastNotified, messages[messages.length - 1].time);
    } catch (e) {
      cache = { at: Date.now(), messages: cache.messages, error: String(e.message || e) };
    } finally { inflight = null; }
    return cache;
  })();
  return inflight;
}

// ---------- loop guardrail: agent messages in a row since the last human message ----------
// Acknowledgments and relay notices do not count, because they cannot start a loop.
function hopsSinceHuman(messages) {
  // New agent-started messages (requests and alerts) since a person last posted, within the rolling window.
  // Replies (ack, result) never count: they wake nobody, so they cannot feed a loop.
  let n = 0;
  const floor = Date.now() - LOOP_WINDOW_MS;
  for (let i = messages.length - 1; i >= 0; i--) {
    const e = messages[i].envelope;
    if (!e || messages[i].time < floor) break;
    if (e.from !== RELAY && (e.type === "request" || e.type === "alert")) n++;
  }
  return n;
}

// ---------- acknowledgment ledger, derived from the channel so it survives restarts ----------
function ledger(messages) {
  const out = [];
  for (const m of messages) {
    const e = m.envelope;
    if (!e || e.type !== "request" || e.to === "all" || e.from === RELAY) continue;
    const ack = messages.find((x) => x.envelope && x.time >= m.time && x.envelope.correlation_id === e.correlation_id &&
      x.envelope.from === e.to && (x.envelope.type === "ack" || x.envelope.type === "result"));
    const escalated = messages.some((x) => x.envelope && x.envelope.from === RELAY && x.envelope.correlation_id === e.correlation_id && /^NO ACKNOWLEDGMENT/.test(String(x.envelope.payload)));
    out.push({ correlation_id: e.correlation_id, from: e.from, to: e.to, requested_at: m.time, message_id: m.id,
      state: ack ? "acknowledged" : escalated ? "escalated" : "pending", acknowledged_at: ack ? ack.time : null,
      acknowledged_by: ack ? ack.envelope.from : null, waiting_seconds: ack ? Math.round((ack.time - m.time) / 1000) : Math.round((Date.now() - m.time) / 1000) });
  }
  return out;
}
const forAgent = (m, agent) => m.envelope && (m.envelope.to === agent || m.envelope.to === "all") && m.envelope.from !== agent;
const pendingFor = (messages, agent) => ledger(messages).filter((r) => r.to === agent && r.state !== "acknowledged");

// ---------- routing rules: who may message whom ----------
function routeDenied(from, to, type, cid, messages) {
  if (!isExternal(from)) return null; // Damian's own agents may message anyone
  if (to === "all") return "Outside agents may not broadcast.";
  if (type === "ack" || type === "result") {
    const open = messages.some((m) => m.envelope && m.envelope.type === "request" && m.envelope.correlation_id === cid && m.envelope.to === from && m.envelope.from === to);
    return open ? null : "Outside agents may only reply to a request that was addressed to them.";
  }
  if (to !== FRONT_DOOR) return "Outside agents may only message " + FRONT_DOOR + ".";
  return null;
}

// ---------- push: release waiting listeners ----------
const waiters = new Map();
const pushLog = new Map();
function notify(m) {
  const targets = m.envelope.to === "all" ? [...AGENTS].filter((a) => a !== m.envelope.from && !isExternal(a)) : [m.envelope.to];
  for (const agent of targets) {
    const set = waiters.get(agent);
    const live = set ? set.size : 0;
    if (set) for (const fn of [...set]) fn();
    const log = pushLog.get(m.id) || {};
    log[agent] = live ? "delivered_to_waiting_listener" : (log[agent] || "queued_until_agent_checks");
    pushLog.set(m.id, log);
  }
  if (pushLog.size > 500) pushLog.delete(pushLog.keys().next().value);
}

async function postEnvelope(fields) {
  const envelope = Object.assign({}, fields, { ts: Date.now() });
  envelope.sig = sign(envelope);
  const text = JSON.stringify(envelope);
  const path = "/channelsbyname/" + encodeURIComponent(CHANNEL) + "/message" + (BOT ? "?bot_unique_name=" + encodeURIComponent(BOT) : "");
  const r = await cliq("POST", path, { text, sync_message: true });
  if (r.status < 200 || r.status > 299) return { ok: false, status: r.status, code: r.json.code };
  const m = { id: decodeURIComponent(String(r.json.message_id || crypto.randomUUID())).replace(" ", "_"), time: Date.now(), sender: "", text, envelope };
  cache.messages.push(m);
  lastNotified = Math.max(lastNotified, m.time);
  notify(m);
  // A recipient with no listener cannot be woken. Tell Damian at once rather than let the request sit.
  if (envelope.type === "request" && envelope.from !== RELAY && envelope.to !== "all" && process.uptime() > 60 && Date.now() - (lastSeen.get(envelope.to) || 0) > 120000) {
    notifyHuman("manual", envelope.to + " has a new request from " + envelope.from + " and is not listening, so it cannot be woken automatically. Open " + envelope.to + " and tell it to check the agent bus. Request ID " + envelope.correlation_id + ".");
  }
  audit("posted", { from: envelope.from, to: envelope.to, type: envelope.type, correlation_id: envelope.correlation_id });
  return { ok: true, message: m };
}

// ---------- direct alerts to Damian through the Agent Bus bot (his own posts in the channel do not notify him) ----------
const humanLog = { urgent: [], security: [], manual: [] };
const lastSeen = new Map();   // agent -> last time it listened or checked
let loopPauseNotifiedAt = 0;
async function notifyHuman(kind, text) {
  if (!ALERT_BOT || !ALERT_USER_IDS) return;
  const now = Date.now();
  const cap = kind === "security" ? 3 : 10;
  const l = (humanLog[kind] = humanLog[kind].filter((t) => now - t < 3600000));
  if (l.length >= cap) return;
  l.push(now);
  const suffix = l.length === cap ? " (Further alerts of this kind are held for an hour. The full record is in #agent-bus.)" : "";
  try {
    const r = await cliq("POST", "/bots/" + encodeURIComponent(ALERT_BOT) + "/message", { text: text + suffix, userids: ALERT_USER_IDS });
    audit("human_alert", { alert: kind, status: r.status });
  } catch (e) { audit("human_alert_failed", { alert: kind }); }
}

// A refusal is reported in the channel so Damian sees it. Limited so a misbehaving agent cannot flood the channel.
const refusalLog = new Map();
async function refuse(res, status, agent, code, detail, to) {
  audit("refused", { from: agent, to, code, detail });
  const now = Date.now();
  const recent = (refusalLog.get(agent) || []).filter((t) => now - t < 600000);
  if (recent.length < 5 && CHANNEL && CHAT_ID && SIGNING) {
    recent.push(now); refusalLog.set(agent, recent);
    try { await postEnvelope({ from: RELAY, to: agent, type: "alert", correlation_id: "refused-" + crypto.randomUUID().slice(0, 8), payload: "REFUSED: a message from " + agent + (to ? " to " + to : "") + " was not carried. " + detail }); } catch (e) {}
  }
  if (code === "loop_guardrail") {
    if (now - loopPauseNotifiedAt > 1800000) { loopPauseNotifiedAt = now; notifyHuman("urgent", "Agent bus paused. " + detail + " To let agents continue now, post any message in #agent-bus."); }
  } else if (isExternal(agent) && code === "not_allowed") {
    notifyHuman("security", "Agent bus refused an outside agent. " + agent + " tried to send to " + (to || "?") + ". " + detail);
  } else if (code === "blocked_sensitive_content" && to && to !== "all" && isExternal(to)) {
    notifyHuman("security", "Agent bus blocked sensitive content. " + agent + " tried to send " + to + " a message. " + detail);
  }
  return send(res, status, { error: code, detail });
}

// ---------- watchdog: re-notify silent recipients, then report them in the channel ----------
const reminded = new Set();
const escalating = new Set();
async function watchdog() {
  try {
    if (!CHANNEL || !CHAT_ID || !SIGNING) return;
    const c = await channelMessages(15000);
    for (const r of ledger(c.messages)) {
      if (r.state === "acknowledged") continue;
      const age = Date.now() - r.requested_at;
      const req = c.messages.find((m) => m.id === r.message_id);
      if (age > ACK_REMIND_MS && !reminded.has(r.correlation_id) && req) { reminded.add(r.correlation_id); notify(req); audit("reminded", { to: r.to, correlation_id: r.correlation_id }); }
      if (age > ACK_ESCALATE_MS && r.state === "pending" && !escalating.has(r.correlation_id)) {
        escalating.add(r.correlation_id);
        await postEnvelope({ from: RELAY, to: r.from, type: "alert", correlation_id: r.correlation_id,
          payload: "NO ACKNOWLEDGMENT: " + r.to + " has not acknowledged the request from " + r.from + " after " + Math.round(age / 60000) + " minutes." });
        notifyHuman("urgent", "No acknowledgment. " + r.to + " has not acknowledged a request from " + r.from + " after " + Math.round(age / 60000) + " minutes. Request ID " + r.correlation_id + ".");
      }
    }
  } catch (e) {}
}
setInterval(watchdog, 20000);

const postLog = new Map();
function underRate(agent) {
  const now = Date.now();
  const l = (postLog.get(agent) || []).filter((t) => now - t < 60000);
  if (l.length >= POSTS_PER_MIN) { postLog.set(agent, l); return false; }
  l.push(now); postLog.set(agent, l); return true;
}
function send(res, status, obj) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function agentFor(req) {
  const h = req.headers["authorization"] || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
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
const publicView = (m) => ({ id: m.id, time: m.time, envelope: m.envelope ? { from: m.envelope.from, to: m.envelope.to, type: m.envelope.type, correlation_id: m.envelope.correlation_id, payload: m.envelope.payload, sender_class: m.envelope.from === RELAY ? "relay" : isExternal(m.envelope.from) ? "outside" : "internal" } : null, human_text: m.envelope ? undefined : m.text });
function inbox(c, agent, since, onlyMine) {
  let l = c.messages.filter((m) => m.time > since);
  // an outside agent only ever sees messages addressed to it
  if (onlyMine || isExternal(agent)) l = l.filter((m) => forAgent(m, agent));
  const latest = c.messages.length ? c.messages[c.messages.length - 1].time : since;
  return { agent, channel: CHANNEL, checked_at: c.at, latest, count: l.length, error: c.error || undefined,
    messages: l.map(publicView), pending_acks: pendingFor(c.messages, agent) };
}

const ROUTES = { "/messages": ["GET", "POST"], "/wait": ["GET"], "/status": ["GET"], "/pending": ["GET"], "/agents": ["GET"], "/audit": ["GET"] , "/admin/cutoff": ["POST"], "/admin/restore": ["POST"] };
const blocked = new Set();   // agents cut off by the admin console; takes effect at once
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && url.pathname === "/healthz") {
      return send(res, 200, { ok: true, version: 4, channel: CHANNEL, configured: Boolean(CHANNEL && CHAT_ID && KEYS.size && SIGNING) });
    }
    if (!ROUTES[url.pathname] || !ROUTES[url.pathname].includes(req.method)) {
      return send(res, 404, { error: "not_found", note: "This service only serves the agent-bus channel." });
    }
    const agent = agentFor(req);
    if (!agent) { audit("unauthorized", { path: url.pathname }); return send(res, 401, { error: "unauthorized" }); }
    if (blocked.has(agent)) { audit("cut_off_agent_refused", { agent, path: url.pathname }); return send(res, 401, { error: "cut_off" }); }
    if (url.pathname === "/admin/cutoff" || url.pathname === "/admin/restore") {
      if (!ADMINS.has(agent)) return send(res, 403, { error: "admin_only" });
      const target = String(url.searchParams.get("agent") || "");
      if (!AGENTS.has(target) && !blocked.has(target)) return send(res, 400, { error: "unknown_agent" });
      if (ADMINS.has(target)) return send(res, 400, { error: "cannot_cut_off_admin" });
      if (url.pathname === "/admin/cutoff") {
        blocked.add(target);
        const set = waiters.get(target); if (set) for (const fn of [...set]) fn();   // drop its open listeners
      } else blocked.delete(target);
      audit(url.pathname === "/admin/cutoff" ? "cut_off" : "restored", { agent: target, by: agent });
      return send(res, 200, { ok: true, cut_off: [...blocked] });
    }
    if (req.method === "GET" && (url.pathname === "/wait" || url.pathname === "/messages")) lastSeen.set(agent, Date.now());
    if (!CHANNEL || !CHAT_ID || !SIGNING) return send(res, 503, { error: "not_configured" });
    const since = Number(url.searchParams.get("since") || "0") || 0;

    if (url.pathname === "/agents") {
      const mayMessage = isExternal(agent) ? [FRONT_DOOR] : [...AGENTS].filter((a) => a !== agent);
      return send(res, 200, { you: agent, your_class: isExternal(agent) ? "outside" : "internal", you_may_send_requests_to: mayMessage,
        agents: [...AGENTS].map((a) => ({ name: a, class: isExternal(a) ? "outside" : "internal" })) });
    }
    if (url.pathname === "/audit") {
      if (!ADMINS.has(agent)) return send(res, 403, { error: "admin_only" });
      const c = await channelMessages(POLL_MS);
      return send(res, 200, { events: events.slice(-200), ledger: ledger(c.messages), hops_since_human: hopsSinceHuman(c.messages), hop_limit: HOP_LIMIT });
    }
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
      if (blocked.has(agent)) return send(res, 401, { error: "cut_off" });
      return send(res, 200, inbox(cache, agent, since, true));
    }
    if (url.pathname === "/status") {
      const cid = String(url.searchParams.get("correlation_id") || "");
      const c = await channelMessages(POLL_MS);
      const row = ledger(c.messages).find((r) => r.correlation_id === cid && (!isExternal(agent) || r.from === agent || r.to === agent));
      if (!row) return send(res, 404, { error: "unknown_correlation_id" });
      return send(res, 200, Object.assign({}, row, { delivery: pushLog.get(row.message_id) || {} }));
    }
    if (url.pathname === "/pending") {
      const c = await channelMessages(POLL_MS);
      return send(res, 200, { pending: ledger(c.messages).filter((r) => r.state !== "acknowledged" && (!isExternal(agent) || r.from === agent || r.to === agent)) });
    }

    // ---------- POST /messages ----------
    let body;
    try { body = JSON.parse((await readBody(req)) || "{}"); } catch (e) { return send(res, 400, { error: "invalid_json" }); }
    const type = String(body.type || "");
    const to = String(body.to || "").trim();
    const cid = String(body.correlation_id || crypto.randomUUID());
    if (!TYPES.includes(type)) return send(res, 400, { error: "invalid_type", allowed: TYPES });
    if (!to) return send(res, 400, { error: "missing_to" });
    if (to !== "all" && !AGENTS.has(to)) return send(res, 400, { error: "unknown_recipient" });
    if (to === agent) return send(res, 400, { error: "cannot_message_yourself" });
    if (body.payload === undefined) return send(res, 400, { error: "missing_payload" });
    if (!underRate(agent)) return refuse(res, 429, agent, "rate_limited", "It sent more than " + POSTS_PER_MIN + " messages in a minute.", to);
    const c = await channelMessages(3000);
    if (c.error) return send(res, 502, { error: c.error });
    const denied = routeDenied(agent, to, type, cid, c.messages);
    if (denied) return refuse(res, 403, agent, "not_allowed", denied, to);
    const payloadText = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload);
    const leak = leakReason(payloadText, to === "all" ? false : isExternal(to));
    if (leak) return refuse(res, 422, agent, "blocked_sensitive_content", "It appeared to contain " + leak + ". Nothing was posted.", to);
    const hops = hopsSinceHuman(c.messages);
    if ((type === "request" || type === "alert") && hops >= HOP_LIMIT) {
      return refuse(res, 429, agent, "loop_guardrail", "Agents have started " + hops + " new messages in the past " + Math.round(LOOP_WINDOW_MS / 60000) + " minutes with no person in the channel. New requests are paused until Damian posts in the channel or the window rolls over. Replies to requests already sent are still carried.", to);
    }
    const fields = { from: agent, to, type, correlation_id: cid, payload: body.payload };
    if (JSON.stringify(fields).length > 4300) return send(res, 413, { error: "payload_too_large" });
    const r = await postEnvelope(fields);
    if (!r.ok) return send(res, 502, { error: "cliq_post_failed", status: r.status, code: r.code });
    if (type === "alert" && !isExternal(agent) && /^WAKE FAILED/.test(payloadText)) notifyHuman("urgent", payloadText.slice(0, 400) + " Request ID " + cid + ".");
    return send(res, 201, { posted: true, message_id: r.message.id, envelope: publicView(r.message).envelope, delivery: pushLog.get(r.message.id) || {},
      ack_required: type === "request" && to !== "all" });
  } catch (e) {
    return send(res, 500, { error: "internal", detail: String(e.message || e).slice(0, 120) });
  }
});
server.listen(PORT, () => console.log("agent-bus-relay v3 on " + PORT + ", channel " + (CHANNEL || "(unset)") + ", agents: " + [...AGENTS].join(", ") + ", outside: " + [...EXTERNAL].join(", ") + ", front door: " + FRONT_DOOR));
