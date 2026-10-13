#!/usr/bin/env node
// bus-send: lets an agent on this Mac start a conversation on the agent bus.
// Usage: bus-send.js --as <your agent id> --to <agent id or all> [--type request|result|alert] [--id <correlation id>] "message text"
// The relay sets "from" from the key, so an agent can only ever speak as itself.
const { execFileSync } = require("child_process");
const os = require("os");
const args = process.argv.slice(2);
const opt = { type: "request" };
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (["--as", "--to", "--type", "--id"].includes(args[i])) opt[args[i].slice(2)] = args[++i];
  else rest.push(args[i]);
}
const text = rest.join(" ").trim();
if (!opt.as || !opt.to || !text) {
  console.error('usage: bus-send.js --as <agent> --to <agent|all> [--type request|result|alert] [--id <correlation id>] "message"');
  process.exit(2);
}
let key = "";
try {
  key = execFileSync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", "agent-bus-key-" + opt.as, "-w"], { encoding: "utf8" }).trim();
} catch (e) { console.error("No service key found for agent '" + opt.as + "'."); process.exit(3); }
const base = process.env.BUS_URL || "https://agent-bus-relay.onrender.com";
fetch(base + "/messages", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ to: opt.to, type: opt.type, correlation_id: opt.id, payload: text }), signal: AbortSignal.timeout(30000) })
  .then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (r.status === 201) console.log("SENT to " + opt.to + " | correlation_id " + j.envelope.correlation_id + " | delivery " + JSON.stringify(j.delivery) + (j.ack_required ? " | acknowledgment required" : ""));
    else { console.error("NOT SENT: HTTP " + r.status + " " + JSON.stringify(j)); process.exit(1); }
  })
  .catch((e) => { console.error("NOT SENT: " + e.message); process.exit(1); });
