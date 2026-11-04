#!/usr/bin/env node
// bridge-wake-sim: proves which bus messages wake an agent, against a local fake relay and a fake openclaw. Nothing leaves this Mac:
// no Keychain read, no real relay, no real agent. Usage: node tests/bridge-wake-sim.js
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-wake-"));
fs.mkdirSync(path.join(tmp, ".openclaw"));
const wakes = path.join(tmp, "wakes.log");
const fake = path.join(tmp, "fake-openclaw");
fs.writeFileSync(fake, '#!/bin/sh\nfor a in "$@"; do last="$a"; case "$prev" in --message) m="$a";; esac; prev="$a"; done\n' +
  'printf "%s\\n" "$m" | grep -m1 "^TESTCASE " >> "' + wakes + '"\n' +
  'echo \'{"status":"ok","result":{"payloads":[{"text":"STATUS: ACK done"}],"meta":{"finalAssistantVisibleText":"STATUS: ACK done"}}}\'\n', { mode: 0o755 });
// The bridge reads its key with execFileSync(security ...). Answer locally so no real key is touched.
const preload = path.join(tmp, "no-keychain.js");
fs.writeFileSync(preload, 'const cp = require("child_process"); const real = cp.execFileSync;\n' +
  'cp.execFileSync = (b, a, o) => (b === "/usr/bin/security" ? "test-key\\n" : real(b, a, o));\n');

const T0 = Date.now();
const msg = (id, type, from, cid, body, age) => ({ id, time: T0 + age, envelope: { from, to: "finance", type, correlation_id: cid, payload: "TESTCASE " + body, sender_class: from === "relay" ? "relay" : "internal" } });
const script = [
  msg("m1", "request", "claude-finance", "same-id", "first-request", 1),
  msg("m2", "request", "claude-finance", "same-id", "second-request-same-id", 2),
  msg("m3", "alert", "claude-finance", "alert-1", "agent-alert", 3),
  msg("m4", "alert", "relay", "alert-2", "relay-notice", 4),
  msg("m5", "alert", "claude-systems", "alert-3", "WAKE-FAILED-notice", 5),
  msg("m6", "result", "claude-systems", "reply-1", "result-reply", 6),
  msg("m7", "ack", "claude-systems", "reply-2", "ack-reply", 7),
];
script[4].envelope.payload = "WAKE FAILED: x could not be woken. TESTCASE WAKE-FAILED-notice";

function runBridge(env) {
  return new Promise((resolve) => {
    fs.writeFileSync(wakes, "");
    fs.writeFileSync(path.join(tmp, ".openclaw", "agent-bus-bridge-state.json"), JSON.stringify({ since: { finance: T0 - 1000 }, done: [] }));
    const posted = [];
    let next = 0;
    const srv = http.createServer((req, res) => {
      let body = "";
      req.on("data", (d) => (body += d));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        if (req.method === "POST") { posted.push(JSON.parse(body)); res.statusCode = 201; return res.end("{}"); }
        // Once m1 is out it stays listed as still pending, to prove one message is never woken twice.
        const pending = next ? [{ correlation_id: "same-id", message_id: "m1" }] : [];
        if (new URL(req.url, "http://x").pathname === "/messages") return res.end(JSON.stringify({ messages: script, pending_acks: pending }));
        // One message per poll, 250 ms apart, so each is finished before the next arrives: this is how a resend reaches a live bridge.
        setTimeout(() => res.end(JSON.stringify({ messages: next < script.length ? [script[next++]] : [], pending_acks: pending })), 250);
      });
    }).listen(0, "127.0.0.1", () => {
      const child = spawn(process.execPath, ["--require", preload, path.join(__dirname, "..", "bridge", "bus-bridge.js")], { stdio: "ignore",
        env: Object.assign({}, process.env, { HOME: tmp, BUS_AGENTS: "finance", BUS_URL: "http://127.0.0.1:" + srv.address().port, OPENCLAW_BIN: fake, WELCOMEIQ_ENABLED: "0" }, env) });
      setTimeout(() => { child.kill(); srv.close(); srv.closeAllConnections(); resolve({ wakes: fs.readFileSync(wakes, "utf8").split("\n").filter(Boolean).map((l) => l.replace("TESTCASE ", "")).sort(), posted }); }, 3500);
    });
  });
}

let bad = 0;
const check = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log((ok ? "PASS  " : "FAIL  ") + name + (ok ? "" : "   got " + JSON.stringify(got) + ", want " + JSON.stringify(want))); };
(async () => {
  const on = await runBridge({});
  check("a request wakes the agent, once", on.wakes.filter((w) => w === "first-request").length, 1);
  check("a second request on the same correlation id wakes the agent", on.wakes.includes("second-request-same-id"), true);
  check("an alert from an agent wakes the agent", on.wakes.includes("agent-alert"), true);
  check("a relay notice wakes nobody", on.wakes.includes("relay-notice"), false);
  check("a WAKE FAILED notice wakes nobody", on.wakes.includes("WAKE-FAILED-notice"), false);
  check("a result reply wakes nobody", on.wakes.includes("result-reply"), false);
  check("an ack reply wakes nobody", on.wakes.includes("ack-reply"), false);
  check("every woken message got its own reply to the sender", on.posted.length, on.wakes.length);
  const off = await runBridge({ BUS_WAKE_ALERTS: "0" });
  check("BUS_WAKE_ALERTS=0 turns alert wakes off", off.wakes.includes("agent-alert"), false);
  check("BUS_WAKE_ALERTS=0 leaves requests alone", off.wakes.includes("second-request-same-id"), true);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(bad ? bad + " FAILED" : "ALL PASSED");
  process.exit(bad ? 1 : 0);
})();
