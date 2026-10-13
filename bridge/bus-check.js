#!/usr/bin/env node
// bus-check: show what is waiting on the agent bus for one named agent.
// Usage: bus-check.js --as <your agent name> [--status <correlation id>] [--hours 24]
// Use it from a Claude session to see requests addressed to that function, then answer with bus-send.js --type ack --id <id>.
const { execFileSync } = require("child_process");
const os = require("os");
const args = process.argv.slice(2);
const opt = { hours: "24" };
for (let i = 0; i < args.length; i++) if (["--as", "--status", "--hours"].includes(args[i])) opt[args[i].slice(2)] = args[++i];
if (!opt.as) { console.error("usage: bus-check.js --as <agent> [--status <correlation id>] [--hours 24]"); process.exit(2); }
let key = "";
try {
  key = execFileSync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", "agent-bus-key-" + opt.as, "-w"], { encoding: "utf8" }).trim();
} catch (e) { console.error("No service key found for agent '" + opt.as + "'."); process.exit(3); }
const base = process.env.BUS_URL || "https://agent-bus-relay.onrender.com";
const get = (p) => fetch(base + p, { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(30000) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
const when = (ms) => new Date(ms).toLocaleString();
(async () => {
  if (opt.status) {
    const r = await get("/status?correlation_id=" + encodeURIComponent(opt.status));
    if (r.status !== 200) { console.log("No request found with that id."); return; }
    const s = r.json;
    console.log(s.from + " -> " + s.to + " | " + s.state.toUpperCase() + (s.acknowledged_by ? " by " + s.acknowledged_by + " after " + s.waiting_seconds + "s" : " | waiting " + s.waiting_seconds + "s") + " | delivery " + JSON.stringify(s.delivery));
    for (const rp of s.replies || []) console.log("  reply (" + rp.type + ", " + s.reply_sender_class + " agent): " + rp.text.replace(/\n/g, "\n  "));
    return;
  }
  const r = await get("/messages?for_me=1&since=" + (Date.now() - Number(opt.hours) * 3600000));
  if (r.status !== 200) { console.error("Bus not reachable: HTTP " + r.status); process.exit(1); }
  const waiting = r.json.pending_acks || [];
  console.log("WAITING FOR YOUR ACKNOWLEDGMENT: " + waiting.length);
  for (const p of waiting) console.log("  from " + p.from + " | id " + p.correlation_id + " | waiting " + p.waiting_seconds + "s | " + p.state);
  console.log("MESSAGES ADDRESSED TO " + opt.as + " IN THE LAST " + opt.hours + " HOURS: " + (r.json.messages || []).length);
  for (const m of r.json.messages || []) {
    const e = m.envelope;
    console.log("  [" + when(m.time) + "] from " + e.from + " (" + e.sender_class + ") | " + e.type + " | id " + e.correlation_id);
    console.log("     " + (typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload)).slice(0, 600).replace(/\n/g, "\n     "));
  }
})().catch((e) => { console.error("Bus not reachable: " + e.message); process.exit(1); });
