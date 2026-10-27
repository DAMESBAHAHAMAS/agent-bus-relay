#!/usr/bin/env node
// Offline test for acceptance #11: a file or image Damian posts in an oc- channel must not vanish silently.
// Runs the exact ocPoll source from server.js in a sandbox with a fake Cliq: no network, no credentials, nothing live.
// Usage: node tests/oc-attachment-sim.js        Exit code 0 = PASS.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const pollSrc = src.match(/^async function ocPoll[\s\S]*?\n}\n/m);
if (!pollSrc) throw new Error("could not find ocPoll in server.js");

const DAMIAN = "653988173", CHAT = "CT_maryalice";
const messages = [
  { id: "1_image", time: 2e12, type: "file", sender: { id: DAMIAN }, content: { file: { name: "receipt.jpg", type: "image/jpeg" } } },
  { id: "2_captioned", time: 2e12 + 1, type: "file", sender: { id: DAMIAN }, content: { file: { name: "lease.pdf" }, comment: "please file this" } },
  { id: "3_text", time: 2e12 + 2, type: "text", sender: { id: DAMIAN }, content: { text: "hello" } },
  { id: "4_other_sender_file", time: 2e12 + 3, type: "file", sender: { id: "999" }, content: { file: { name: "x.png" } } },
];
const posts = [], audits = [];
const ctx = {
  console, JSON, Set, Map, Math, Number, String, Array, Object, Promise,
  Date: { now: () => 2e12 + 10 },
  OC: { maryalice: CHAT }, AGENTS: new Set(["maryalice"]), SIGNING: "x", READS_PER_MIN: 12, reads: [], ocState: new Map(),
  OC_HINT_MIN_MS: 3000, OC_PRIORITY: "maryalice", OC_PRIORITY_MS: 20000, OC_POLL_MS: 60000, STARTED_AT: 0, waiters: new Map(),
  fromDamian: (m) => m.sender_id === DAMIAN, ocIsRelayPost: (a, c, text) => /^\[relay\] /.test(text),
  audit: (k, d) => audits.push([k, d]),
  ocPost: async (chat, text) => { posts.push([chat, text]); return { ok: true }; },
  cliq: async () => ({ status: 200, json: { data: messages } }),
};
vm.createContext(ctx);
vm.runInContext(pollSrc[0] + "\nthis.ocPoll = ocPoll;", ctx);

(async () => {
  await ctx.ocPoll();
  await new Promise((r) => setImmediate(r));
  const inbox = ctx.ocState.get("maryalice").inbox;
  const results = [];
  const check = (name, fn) => { try { fn(); results.push("PASS  " + name); } catch (e) { results.push("FAIL  " + name + "  <-- " + e.message); } };
  check("image-only message produces a visible notice in the channel", () =>
    assert.ok(posts.some(([c, t]) => c === CHAT && /receipt\.jpg/.test(t) && /^\[relay\] /.test(t))));
  check("captioned file produces a notice too", () => assert.ok(posts.some(([, t]) => /lease\.pdf/.test(t))));
  check("each dropped file is audited", () => assert.strictEqual(audits.filter(([k]) => k === "oc_attachment_not_delivered").length, 2));
  check("the agent is told a file was attached (image only)", () =>
    assert.ok(inbox.some((m) => m.id === "1_image" && /attached receipt\.jpg/.test(m.text))));
  check("the caption reaches the agent with the note", () =>
    assert.ok(inbox.some((m) => m.id === "2_captioned" && /please file this/.test(m.text) && /cannot carry files/.test(m.text))));
  check("plain text is unchanged", () => assert.ok(inbox.some((m) => m.id === "3_text" && m.text === "hello")));
  check("a file from someone else is ignored (no notice, no inbox)", () => {
    assert.ok(!posts.some(([, t]) => /x\.png/.test(t))); assert.ok(!inbox.some((m) => m.id === "4_other_sender_file"));
  });
  check("the relay's own notice is not fed back as Damian's message", () => assert.ok(!inbox.some((m) => /^\[relay\] /.test(m.text))));
  console.log(results.join("\n"));
  const fail = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(fail ? "RESULT: FAIL (" + fail + ")" : "RESULT: PASS (" + results.length + "/" + results.length + ")");
  process.exit(fail ? 1 : 0);
})();
