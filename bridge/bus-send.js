#!/usr/bin/env node
// bus-send: send a message on the agent bus from this Mac, as one named agent.
// Usage: bus-send.js --as <your agent name> --to <agent name or all> [--type request|result|ack|alert] [--id <correlation id>] [--wait <seconds>] [--damian <Cliq message id>] "message text"
// --damian: pass on an instruction Damian typed in #agent-bus; the relay verifies it is from his own Cliq account.
// --wait: after sending a request, wait for the recipient's own acknowledgment and print its reply.
//         With --to all (a roll call), print each agent's own reply as it arrives and list who stayed silent.
// The relay sets "from" from the key, so an agent can only ever speak as itself.
const { execFileSync } = require("child_process");
const os = require("os");
const args = process.argv.slice(2);
const opt = { type: "request" };
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (["--as", "--to", "--type", "--id", "--wait", "--damian"].includes(args[i])) opt[args[i].slice(2)] = args[++i];
  else rest.push(args[i]);
}
const text = rest.join(" ").trim();
if (!opt.as || !opt.to || !text) {
  console.error('usage: bus-send.js --as <agent> --to <agent|all> [--type request|result|ack|alert] [--id <correlation id>] "message"');
  process.exit(2);
}
let key = "";
try {
  key = execFileSync("/usr/bin/security", ["find-generic-password", "-a", os.userInfo().username, "-s", "agent-bus-key-" + opt.as, "-w"], { encoding: "utf8" }).trim();
} catch (e) { console.error("No service key found for agent '" + opt.as + "'."); process.exit(3); }
const base = process.env.BUS_URL || "https://agent-bus-relay.onrender.com";
fetch(base + "/messages", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  body: JSON.stringify({ to: opt.to, type: opt.type, correlation_id: opt.id, payload: text, damian_instruction: opt.damian }), signal: AbortSignal.timeout(30000) })
  .then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (r.status === 201) {
      const cid = j.envelope.correlation_id;
      console.log("SENT to " + opt.to + " | correlation_id " + cid + " | delivery " + JSON.stringify(j.delivery) + (j.ack_required ? " | acknowledgment required" : ""));
      const waitS = Number(opt.wait || 0);
      if (!waitS || !j.ack_required) return;
      const get = (p) => fetch(base + p, { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(30000) }).then((x) => x.json()).catch(() => ({}));
      const t0 = Date.now();
      if (opt.to === "all") {
        const seen = new Set();
        const expected = j.recipients || [];
        console.log("ROLL CALL: waiting for " + expected.length + " agents: " + expected.join(", "));
        while (Date.now() - t0 < waitS * 1000 && seen.size < expected.length) {
          await new Promise((ok) => setTimeout(ok, 3000));
          const st = await get("/status?correlation_id=" + encodeURIComponent(cid));
          for (const r of st.recipients || []) {
            if (r.state !== "acknowledged" || seen.has(r.to)) continue;
            seen.add(r.to);
            const last = (r.replies || []).slice(-1)[0];
            console.log("ACKNOWLEDGED by " + r.to + " after " + r.waiting_seconds + " seconds: " + (last ? last.text.replace(/\s+/g, " ").slice(0, 400) : "(reply text not found; see #agent-bus)"));
          }
        }
        const silent = expected.filter((a) => !seen.has(a));
        console.log("ROLL CALL: " + seen.size + " of " + expected.length + " acknowledged." + (silent.length ? " NO ACKNOWLEDGMENT yet from: " + silent.join(", ") + ". The relay will report them." : ""));
        if (silent.length) process.exitCode = 4;
        return;
      }
      while (Date.now() - t0 < waitS * 1000) {
        await new Promise((ok) => setTimeout(ok, 2000));
        const st = await get("/status?correlation_id=" + encodeURIComponent(cid));
        if (st.state === "acknowledged") {
          // A long reply arrives as "[part i/n]" messages: keep reading (up to 30 s more) until all n are in, then print them in order.
          const text = (m) => (typeof m.envelope.payload === "string" ? m.envelope.payload : JSON.stringify(m.envelope.payload));
          let replies = [];
          for (const until = Date.now() + 30000; ; await new Promise((ok) => setTimeout(ok, 2000))) {
            const inbox = await get("/messages?for_me=1&since=" + (t0 - 5000));
            replies = (inbox.messages || []).filter((m) => m.envelope && m.envelope.correlation_id === cid && m.envelope.from === st.acknowledged_by);
            const total = Math.max(0, ...replies.map((m) => Number((/^\[part \d+\/(\d+)\]/.exec(text(m)) || [])[1] || 0)));
            // Keep reading while no reply has shown up yet (the inbox can lag the acknowledgment) or parts are still missing.
            if (Date.now() > until || (replies.length && (!total || replies.length >= total))) break;
          }
          console.log("ACKNOWLEDGED by " + st.acknowledged_by + " after " + st.waiting_seconds + " seconds. Its reply:");
          console.log(replies.length ? replies.map(text).join("\n") : "(reply text not found; see #agent-bus)");
          return;
        }
      }
      console.log("NO ACKNOWLEDGMENT from " + opt.to + " after " + waitS + " seconds. The request is still open; the relay will report it.");
      process.exitCode = 4;
    } else { console.error("NOT SENT: HTTP " + r.status + " " + (j.error || "") + (j.detail ? " - " + j.detail : "")); process.exit(1); }
  })
  .catch((e) => { console.error("NOT SENT: " + e.message); process.exit(1); });
