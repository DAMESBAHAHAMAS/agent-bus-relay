// Offline tests for the Cliq profile of chatgpt/executor.js and its two settings files. No network, Zoho, Cliq or real claude run.
// Run: node --test chatgpt/test/
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "cliq-exec-test-"));
process.env.BUS_CLIQ_ROOT = path.join(TMP, "root");
const ex = require("../executor");
const S = JSON.parse(fs.readFileSync(path.join(__dirname, "../executor-cliq-settings.json"), "utf8")).permissions;
const T = JSON.parse(fs.readFileSync(path.join(__dirname, "../executor-cliq-settings.test-b.json"), "utf8")).permissions;
const P = "1156860000009303132", K = "1156860000009303226";
const damian = (text, extra) => Object.assign({ id: "1792500000000_1", from: "damian", damian_verified: true, text }, extra);

test("only Damian's relay-verified words in the assignment form are assignments", () => {
  assert.deepStrictEqual(ex.cliqAssignment(damian("task " + P + "/" + K + ": summarise the task")),
    { project_id: P, task_id: K, instruction: "summarise the task", message_id: "1792500000000_1" });
  assert.strictEqual(ex.cliqAssignment(damian("task " + P + "/" + K + ": x", { from: "bizops" })), null, "another sender");
  assert.strictEqual(ex.cliqAssignment(damian("task " + P + "/" + K + ": x", { damian_verified: false })), null, "not verified");
  assert.strictEqual(ex.cliqAssignment(damian("please do task " + K)), null, "free text");
  assert.strictEqual(ex.cliqAssignment(damian("task " + P + "/" + K + ":   ")), null, "empty instruction");
  assert.strictEqual(ex.cliqAssignment(damian("task abc/" + K + ": x")), null, "non-numeric id");
});

test("one session per task: new first, resumed once its session file exists", () => {
  const root = path.join(TMP, "sess");
  const a = ex.cliqSession(K, { root, exists: () => false });
  assert.strictEqual(a.resume, false); assert.match(a.id, /^[0-9a-f-]{36}$/);
  const b = ex.cliqSession(K, { root, exists: () => true });
  assert.deepStrictEqual([b.resume, b.id, b.cwd], [true, a.id, a.cwd]);
  assert.match(ex.sessionFile(a.cwd, a.id), new RegExp(fs.realpathSync(a.cwd).replace(/[^A-Za-z0-9]/g, "-") + "/" + a.id + "\\.jsonl$"));
});

const openTask = async () => ({ ok: true, open: true, name: "Draft technical implementation specification", project_name: "International Booking Platform", status: "Open", description: "d" });
const fakeSession = () => ({ id: "11111111-2222-3333-4444-555555555555", resume: false, cwd: fs.mkdtempSync(path.join(TMP, "cwd-")) });

test("gates: switched off, unusable task and closed task are all BLOCKED before any run", async () => {
  for (const [on, check, want] of [[() => false, openTask, /switched off/], [() => true, async () => ({ ok: false, reason: "task_not_found_or_unreadable" }), /not usable/],
    [() => true, async () => ({ ok: true, open: false, name: "x" }), /is closed/]]) {
    const posts = []; let ran = false;
    await ex.executeCliq(ex.cliqAssignment(damian("task " + P + "/" + K + ": x")), { post: async (t) => posts.push(t), on, check, run: async () => { ran = true; }, session: fakeSession });
    assert.strictEqual(ran, false); assert.strictEqual(posts.length, 1); assert.match(posts[0], want); assert.match(posts[0], /^STATUS: BLOCKED/);
  }
});

test("a run posts STARTED, then the result with the Zoho summary and the STATUS line last; write-back goes through update()", async () => {
  const posts = [], updates = [];
  const run = async (_bin, text, s) => { assert.match(text, /INSTRUCTION\n summarise|<<<INSTRUCTION\nsummarise/); return { ok: true, text: "Did it. Evidence: summary.md\n```zoho-update\n{\"comment\": \"c\"}\n```\nSTATUS: COMPLETE" }; };
  await ex.executeCliq(ex.cliqAssignment(damian("task " + P + "/" + K + ": summarise")), { post: async (t) => posts.push(t), on: () => true, check: openTask, run,
    update: async (p, t, body) => { updates.push([p, t, body]); return { ok: false, reason: "disabled for test" }; }, session: fakeSession });
  assert.strictEqual(posts.length, 2);
  assert.match(posts[0], /^STATUS: STARTED cliq-[0-9a-f]{20} on task 1156860000009303226 .*session 11111111-2222-3333-4444-555555555555 \(new\)/);
  assert.match(posts[1], /Zoho: not updated \(disabled for test\)/); assert.match(posts[1], /STATUS: COMPLETE$/);
  assert.deepStrictEqual(updates.map((u) => [u[0], u[1], u[2].comment]), [[P, K, "c"]]);
  assert.match(updates[0][2].cid, /^cliq-/);
});

test("one run at a time: a second assignment during a run is refused", async () => {
  let release; const gate = new Promise((r) => (release = r));
  const posts = [];
  const opts = { post: async (t) => posts.push(t), on: () => true, check: openTask, session: fakeSession, update: async () => ({}),
    run: async () => { await gate; return { ok: true, text: "ok\nSTATUS: COMPLETE" }; } };
  const first = ex.executeCliq(ex.cliqAssignment(damian("task " + P + "/" + K + ": one")), opts);
  await new Promise((r) => setTimeout(r, 50));
  await ex.executeCliq(ex.cliqAssignment(damian("task " + P + "/" + K + ": two", { id: "2" })), opts);
  assert.ok(posts.some((p) => /another Claude Code run is in progress/.test(p)));
  release(); await first;
});

test("runCliq: connectors load (no --strict-mcp-config), dontAsk, the Cliq settings, --session-id then --resume", async () => {
  const fake = path.join(TMP, "fake-claude.js");
  fs.writeFileSync(fake, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ result: JSON.stringify(process.argv.slice(2)), session_id: 'x' }));\n");
  fs.chmodSync(fake, 0o755);
  const cwd = fs.mkdtempSync(path.join(TMP, "run-"));
  const args = async (resume) => JSON.parse((await ex.runCliq(fake, "hello", { id: "abc", resume, cwd }, process.env)).text);
  const a = await args(false), b = await args(true);
  assert.ok(!a.includes("--strict-mcp-config") && !a.includes("--no-session-persistence"));
  assert.strictEqual(a[a.indexOf("--permission-mode") + 1], "dontAsk");
  assert.strictEqual(a[a.indexOf("--settings") + 1], ex.CLIQ_SETTINGS);
  assert.strictEqual(a[a.indexOf("--setting-sources") + 1], "");
  assert.strictEqual(a[a.indexOf("--session-id") + 1], "abc"); assert.strictEqual(b[b.indexOf("--resume") + 1], "abc");
});

test("production Cliq settings: individual read-only connector tools, Zia denied, no pushes, credentials denied", () => {
  const mcp = S.allow.filter((r) => r.startsWith("mcp__"));
  assert.ok(mcp.length > 0 && mcp.every((r) => !r.includes("*")), "no connector wildcards");
  assert.ok(mcp.every((r) => /__Zoho(Projects_get_|Workdrive_(File_Property|Breadcrumbs_Of_File|Fetch_Files_Folders|Sub_Folders|Get_|Search_Records))/.test(r)), "read tools only");
  assert.ok(!S.allow.some((r) => /git push/.test(r)) && S.deny.includes("Bash(git push:*)"));
  for (const z of ["ask_senior_projects_manager", "list_folder", "read_file"]) assert.ok(S.deny.includes("mcp__claude_ai_ZIA_AGENT_API_X__" + z));
  for (const d of ["Read(~/.openclaw/**)", "Read(~/*token*)", "Read(**/.env)", "Read(~/Library/Keychains/**)", "Read(~/Developer/local-credentials/**)", "Bash(git push origin main:*)"]) assert.ok(S.deny.includes(d), d);
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, "../executor-settings.json"), "utf8")).permissions.deny;
  for (const d of base.filter((x) => !/^Bash\(git push/.test(x))) assert.ok(S.deny.includes(d), "keeps the delegated executor's deny " + d);
});

test("test-B settings: writes only in the test work root; no commit, branch, build, node or web search", () => {
  assert.deepStrictEqual(T.allow.filter((r) => /^(Edit|Write)\(/.test(r)), ["Edit(~/.agent-bus/exec/cliq-test/**)", "Write(~/.agent-bus/exec/cliq-test/**)"]);
  assert.ok(!T.allow.some((r) => /git (add|commit|branch|switch|checkout|push)|npm|npx|node|python3/.test(r)) && !T.allow.includes("WebSearch"));
  for (const d of ["Bash(git branch:*)", "Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)", "WebSearch", "Edit(~/Developer/**)", "Write(~/Developer/**)"]) assert.ok(T.deny.includes(d), d);
});
