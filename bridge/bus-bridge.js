#!/usr/bin/env node
// bus-bridge: runs on Damian's Mac. For each OpenClaw agent it holds an open line to the relay.
// The instant a request arrives for an agent, it wakes that agent through the local OpenClaw
// gateway and posts the agent's own reply back to the bus as the acknowledgment.
// - Outbound connections only. The OpenClaw gateway stays private on this Mac.
// - The bridge never writes an acknowledgment itself. No agent reply means no acknowledgment,
//   and the relay then reports the silence in the channel.
const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.BUS_URL || "https://agent-bus-relay.onrender.com";
const AGENTS = (process.env.BUS_AGENTS || "bizops,finance,salesmkt,systems,compliance,codedev").split(",").map((s) => s.trim()).filter(Boolean);
const NODE_DIR = path.dirname(process.execPath);
const OPENCLAW = process.env.OPENCLAW_BIN || path.join(NODE_DIR, "openclaw");
const STATE_FILE = path.join(os.homedir(), ".openclaw", "agent-bus-bridge-state.json");
const RUN_TIMEOUT_S = Number(process.env.BUS_RUN_TIMEOUT_S || "300");
const MAX_ATTEMPTS = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
function keyFor(agent) {
  return execFileSync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", "agent-bus-key-" + agent, "-w"], { encoding: "utf8" }).trim();
}
let state = { since: {}, done: [] };
try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))); } catch (e) {}
const done = new Set(state.done);
const busy = new Set();
const attempts = new Map();
function save() {
  state.done = [...done].slice(-500);
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 }); } catch (e) {}
}

function runAgent(agent, message) {
  return new Promise((resolve) => {
    execFile(OPENCLAW, ["agent", "--agent", agent, "--session-key", "agent-bus", "--message", message, "--json", "--timeout", String(RUN_TIMEOUT_S)],
      { maxBuffer: 32 * 1024 * 1024, timeout: (RUN_TIMEOUT_S + 30) * 1000, env: Object.assign({}, process.env, { PATH: NODE_DIR + ":/opt/homebrew/bin:/usr/bin:/bin:" + (process.env.PATH || "") }) },
      (err, stdout) => {
        try {
          const raw = String(stdout || "");
          const j = JSON.parse(raw.slice(raw.indexOf("{")));
          const meta = (j.result && j.result.meta) || {};
          const payloads = (j.result && j.result.payloads) || [];
          const text = meta.finalAssistantVisibleText || (payloads[0] && payloads[0].text) || "";
          resolve({ ok: j.status === "ok" && Boolean(text), text, status: j.status });
        } catch (e) { resolve({ ok: false, text: "", status: err ? "run_failed" : "unreadable_output" }); }
      });
  });
}

async function api(key, method, pathAndQuery, body, timeoutMs) {
  const r = await fetch(BASE + pathAndQuery, { method, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 40000) });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}

async function handle(agent, key, env) {
  const cid = env.correlation_id;
  if (busy.has(cid) || done.has(cid) || (attempts.get(cid) || 0) >= MAX_ATTEMPTS) return;
  busy.add(cid);
  attempts.set(cid, (attempts.get(cid) || 0) + 1);
  log(agent, "woken by request from", env.from, "id", cid);
  try {
    const body = typeof env.payload === "string" ? env.payload : JSON.stringify(env.payload);
    const prompt = '[Agent bus] You have a request from the agent "' + env.from + '" (correlation_id: ' + cid + ").\n\n" + body +
      "\n\nReply now. Your reply is posted back to " + env.from + " on the agent bus automatically as your acknowledgment, so do not try to send it yourself. " +
      "Begin by confirming you received the request, then answer it or state exactly what you will do and by when.";
    const run = await runAgent(agent, prompt);
    if (!run.ok) { log(agent, "produced no reply for", cid, "(" + run.status + "). No acknowledgment sent."); return; }
    const r = await api(key, "POST", "/messages", { to: env.from, type: "ack", correlation_id: cid, payload: run.text.slice(0, 3500) });
    if (r.status === 201) { done.add(cid); save(); log(agent, "acknowledged", cid); }
    else log(agent, "could not post acknowledgment for", cid, "HTTP", r.status, JSON.stringify(r.json).slice(0, 160));
  } finally { busy.delete(cid); }
}

async function loop(agent) {
  let key;
  try { key = keyFor(agent); } catch (e) { log(agent, "has no service key in Keychain. Skipping."); return; }
  let since = state.since[agent] || Date.now();
  log(agent, "listening");
  for (;;) {
    try {
      const r = await api(key, "GET", "/wait?since=" + since + "&timeout=25", null, 45000);
      if (r.status !== 200) { await sleep(r.status === 401 ? 60000 : 5000); continue; }
      const todo = new Map();
      for (const m of r.json.messages || []) {
        since = Math.max(since, m.time);
        if (m.envelope && m.envelope.type === "request") todo.set(m.envelope.correlation_id, m.envelope);
      }
      state.since[agent] = since; save();
      // reminders from the relay: requests still waiting on this agent
      const waiting = (r.json.pending_acks || []).filter((p) => !todo.has(p.correlation_id) && !done.has(p.correlation_id) && !busy.has(p.correlation_id) && (attempts.get(p.correlation_id) || 0) < MAX_ATTEMPTS);
      if (waiting.length) {
        const all = await api(key, "GET", "/messages?for_me=1&since=0");
        for (const m of all.json.messages || []) if (m.envelope && m.envelope.type === "request" && waiting.some((p) => p.correlation_id === m.envelope.correlation_id)) todo.set(m.envelope.correlation_id, m.envelope);
      }
      for (const env of todo.values()) handle(agent, key, env); // do not block listening while an agent thinks
      if (!(r.json.messages || []).length) await sleep(250);
    } catch (e) { await sleep(5000); }
  }
}

log("bus-bridge starting for", AGENTS.join(", "), "->", BASE);
for (const a of AGENTS) loop(a);
