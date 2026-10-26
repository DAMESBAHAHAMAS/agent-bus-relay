// Offline proof of the delegated executor's repository path: real git, a throwaway origin and checkout, a fake model run.
// No real repository, Zoho task, bus message or Claude run is touched. Run: node --test chatgpt/test/executor.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "exec-test-"));
process.env.BUS_EXEC_ROOT = path.join(TMP, "exec");
process.env.BUS_DEV_ROOT = path.join(TMP, "Developer");
process.env.BUS_DELEGATION_SWITCH = path.join(TMP, "delegation.on");
const executor = require("../executor");

const g = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }) }).trim();
const LIVE = path.join(TMP, "Developer", "demo");
const TASK = { ok: true, open: true, name: "Fix the widget", status: "Open", project_name: "P", description: "Fix it." };
const env = (payload) => ({ from: "chatgpt", correlation_id: "cgpt-test-" + Math.random().toString(16).slice(2), payload: Object.assign({ kind: "delegated_task", project_id: "1000001", task_id: "2000002", instruction: "do it" }, payload) });
async function exec(e, run) {
  const posts = [];
  await executor.execute(e, executor.delegation(e), { post: async (type, text) => { posts.push({ type, text }); return { status: 201 }; },
    claudeBin: "unused", childEnv: process.env, check: async () => TASK, update: async () => ({ ok: true, fields_written: [] }), run });
  return posts;
}

before(() => {
  fs.writeFileSync(process.env.BUS_DELEGATION_SWITCH, "on");
  const origin = path.join(TMP, "origin.git");
  g(TMP, "init", "--bare", "-b", "main", origin);
  fs.mkdirSync(path.dirname(LIVE), { recursive: true });
  g(TMP, "clone", "-q", origin, LIVE);
  fs.writeFileSync(path.join(LIVE, "README.md"), "demo\n");
  g(LIVE, "add", "README.md"); g(LIVE, "commit", "-qm", "init"); g(LIVE, "push", "-q", "origin", "main");
  g(LIVE, "remote", "set-head", "origin", "main");
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

test("repo must be a plain folder name and never the relay itself", () => {
  for (const bad of ["../etc", "/abs", "a/b", ".hidden", "agent-bus-relay", "agent-bus-relay-chatgpt", "Agent-Bus-Relay-cliq-dev", 7, ""])
    assert.deepStrictEqual(executor.delegation(env({ repo: bad })), { invalid: true, reason: "repo" }, String(bad));
  assert.strictEqual(executor.delegation(env({ repo: "florida-business-launchpad" })).repo, "florida-business-launchpad");
  assert.strictEqual(executor.delegation(env({})).repo, undefined);
});

test("a forbidden repo is refused before any lookup or run", async () => {
  let ran = false;
  const posts = await exec(env({ repo: "agent-bus-relay" }), async () => { ran = true; return { ok: true, text: "" }; });
  assert.strictEqual(ran, false);
  assert.match(posts[0].text, /STATUS: BLOCKED: repo must be/);
});

test("a repo task runs in a bridge-made worktree on its own branch; the bridge verifies commits and push", async () => {
  let seen;
  const posts = await exec(env({ repo: "demo" }), async (bin, text, cwd) => {
    seen = { text, cwd, branch: g(cwd, "rev-parse", "--abbrev-ref", "HEAD") };
    fs.writeFileSync(path.join(cwd, "widget.js"), "module.exports = 1;\n");
    g(cwd, "add", "widget.js"); g(cwd, "commit", "-qm", "Fix the widget");   // the model commits; it does not push
    return { ok: true, text: "Fixed.\nSTATUS: COMPLETE" };
  });
  assert.strictEqual(seen.cwd, path.join(process.env.BUS_EXEC_ROOT, "2000002", "demo"));
  assert.strictEqual(seen.branch, "chatgpt/2000002-fix-the-widget");
  assert.match(seen.text, /already on branch chatgpt\/2000002-fix-the-widget/);
  assert.match(posts[0].text, /^STATUS: STARTED .* in demo on branch chatgpt\/2000002-fix-the-widget/);
  const res = posts[posts.length - 1];
  assert.strictEqual(res.type, "result");
  assert.match(res.text, /BRIDGE-VERIFIED EVIDENCE/);
  assert.match(res.text, /1 new commit\(s\)/);
  assert.match(res.text, /Fix the widget/);
  assert.match(res.text, /working tree: clean/);
  assert.match(res.text, /pushed to origin: yes, remote head matches/);   // pushed by the bridge
  assert.match(seen.text, /Do not push/);
  assert.strictEqual(g(path.join(TMP, "origin.git"), "rev-parse", "main"), g(LIVE, "rev-parse", "main"));   // origin main unmoved
  assert.match(res.text, /STATUS: COMPLETE\s*$/);
  // Damian's live checkout is untouched: still on main, no new file.
  assert.strictEqual(g(LIVE, "rev-parse", "--abbrev-ref", "HEAD"), "main");
  assert.strictEqual(fs.existsSync(path.join(LIVE, "widget.js")), false);
});

test("a retry of the same task continues on the same worktree and branch", async () => {
  let cwd2, branch2;
  const posts = await exec(env({ repo: "demo" }), async (bin, text, cwd) => {
    cwd2 = cwd; branch2 = g(cwd, "rev-parse", "--abbrev-ref", "HEAD");
    fs.writeFileSync(path.join(cwd, "widget.js"), "module.exports = 2;\n");   // edited, not committed or pushed
    return { ok: true, text: "Half done.\nSTATUS: BLOCKED: ran out of time" };
  });
  assert.strictEqual(cwd2, path.join(process.env.BUS_EXEC_ROOT, "2000002", "demo"));
  assert.strictEqual(branch2, "chatgpt/2000002-fix-the-widget");
  const res = posts[posts.length - 1].text;
  assert.match(res, /1 new commit\(s\)/);   // counted from the fork point, so the first attempt's commit still shows
  assert.match(res, /working tree: 1 uncommitted change\(s\)/);
  assert.match(res, /STATUS: BLOCKED: ran out of time\s*$/);
});

test("a folder that is not a git repository is refused", async () => {
  fs.mkdirSync(path.join(TMP, "Developer", "notes"), { recursive: true });
  const posts = await exec(env({ repo: "notes", task_id: "2000003" }), async () => { throw new Error("must not run"); });
  assert.match(posts[0].text, /STATUS: BLOCKED: repo notes is not a git repository/);
});

test("a task with no repo lists its deliverables with hashes, and is told it cannot commit", async () => {
  let prompt;
  const posts = await exec(env({ task_id: "2000004" }), async (bin, text, cwd) => {
    prompt = text; fs.writeFileSync(path.join(cwd, "report.md"), "# report\n");
    return { ok: true, text: "Wrote it.\nSTATUS: COMPLETE" };
  });
  assert.match(prompt, /resend delegate_task with repo set/);
  const res = posts[posts.length - 1].text;
  assert.match(res, /report\.md \(9 bytes, sha256 [0-9a-f]{16}\)/);
  assert.match(res, /STATUS: COMPLETE\s*$/);
});

test("a run that ends without a report still carries the bridge's evidence and is BLOCKED", async () => {
  const posts = await exec(env({ task_id: "2000005" }), async () => ({ ok: false, text: "", status: "timed_out" }));
  const res = posts[posts.length - 1].text;
  assert.match(res, /BRIDGE-VERIFIED EVIDENCE/);
  assert.match(res, /STATUS: BLOCKED: the run ended without a report \(timed_out\)/);
});
