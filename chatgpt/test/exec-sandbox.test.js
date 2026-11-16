// Offline checks of the delegated run's argv and settings (execArgs / execSettings) and of its run folder (newRun / prepareRepo).
// Real git on a throwaway repository, no Claude run. Run: node --test chatgpt/test/exec-sandbox.test.js
const { test, after: afterAll } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exec-sbx-")));
process.env.BUS_EXEC_ROOT = path.join(TMP, "exec");
process.env.BUS_DEV_ROOT = path.join(TMP, "Developer");
const executor = require("../executor");
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }) }).trim();
const after = (argv, flag) => argv[argv.indexOf(flag) + 1];
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

function source(name) {
  const origin = path.join(TMP, name + ".git"); g(TMP, "init", "-q", "--bare", "-b", "main", origin);
  const live = path.join(TMP, "Developer", name);
  fs.mkdirSync(path.dirname(live), { recursive: true });
  g(TMP, "clone", "-q", origin, live); fs.writeFileSync(path.join(live, "r.txt"), "r\n"); g(live, "add", "r.txt"); g(live, "commit", "-qm", "r");
  g(live, "push", "-q", "origin", "HEAD:main"); g(live, "remote", "set-head", "origin", "main");
  return live;
}

test("the static settings: no file-tool writes of their own, git --output denied, bypass mode disabled, sandbox on with no unsandboxed escape", () => {
  const s = JSON.parse(fs.readFileSync(executor.SETTINGS, "utf8"));
  const allow = s.permissions.allow, deny = s.permissions.deny;
  assert.equal(s.permissions.defaultMode, "dontAsk");
  assert.equal(s.permissions.disableBypassPermissionsMode, "disable");
  assert.ok(!allow.some((r) => /^(Edit|Write)\b/.test(r)), "no static Edit/Write allow rule: each run gets its own work tree only: " + allow.join(", "));
  for (const r of ["Bash(git * --output*)", "Bash(git *--output=*)", "Edit(**/.git/hooks/**)", "Write(**/.git/config)", "Write(~/Developer/agent-bus-relay/**)",
    "Edit(~/.agent-bus/exec/.running.json)", "Write(~/.agent-bus/exec/.running.json)", "Edit(**/.git)", "Write(**/.git)"])
    assert.ok(deny.includes(r), "denied: " + r);
  assert.ok(!allow.some((r) => /^Bash\(git branch:/.test(r)), "git branch is read-only (no prefix rule that admits -D / -f)");
  assert.ok(!allow.some((r) => /git (switch|checkout|push|update-ref|symbolic-ref|reset)/.test(r)), "no branch switch, ref or push rule for the model");
  assert.equal(s.sandbox.enabled, true);
  assert.equal(s.sandbox.failIfUnavailable, true);
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
  assert.equal(s.sandbox.autoAllowBashIfSandboxed, false);
});

test("a repository run: sandbox writes only its work tree, the worktree git folder (not HEAD, refs, config or pointers), its own objects and its own run ref", async () => {
  const live = source("demo");
  const run = executor.newRun("2000002");
  const repo = await executor.prepareRepo({ repo: "demo", task_id: "2000002" }, { name: "x" }, run);
  assert.ok(repo.ok, repo.reason);
  const { cwd: wt, gitDir, commonDir } = repo;
  const argv = executor.execArgs("PROMPT", { model: "haiku", cwd: wt, repo });
  assert.ok(!argv.includes("--add-dir"), "~/Developer is not a working directory of the run");
  assert.ok(!argv.includes("bypassPermissions"));
  assert.equal(after(argv, "--permission-mode"), "dontAsk");
  assert.equal(after(argv, "--setting-sources"), "");
  assert.ok(argv.includes("--strict-mcp-config"));
  assert.equal(after(argv, "--tools"), "Read,Glob,Grep,Write,Edit,Bash,WebSearch", "no subagent, scheduler, trigger or messaging tools");
  const s = JSON.parse(after(argv, "--settings"));
  const f = s.sandbox.filesystem;
  const ref = path.join(commonDir, "refs", "heads", "chatgpt-run", "2000002", run.id);
  assert.deepEqual(f.allowWrite.slice().sort(), [wt, gitDir, path.join(run.dir, "objects"), ref, ref + ".lock",
    path.join(commonDir, "logs", "refs", "heads", "chatgpt-run", "2000002", run.id)].sort());
  for (const p of [path.join(wt, ".git"), executor.MARKER, ...["HEAD", "refs", "config", "commondir", "gitdir", "config.worktree", "hooks"].map((x) => path.join(gitDir, x)),
    path.join(commonDir, "config"), path.join(commonDir, "hooks")]) assert.ok(f.denyWrite.includes(p), "sandbox denyWrite: " + p);
  assert.ok(!f.allowWrite.includes(path.join(commonDir, "objects")), "the shared objects are read-only");
  assert.ok(!f.allowWrite.some((p) => p.startsWith(path.join(commonDir, "refs", "heads", "chatgpt") + path.sep) || p === path.join(commonDir, "refs", "heads", "chatgpt")), "no task branch ref is writable");
  assert.ok(!f.allowWrite.includes(run.dir) && !f.allowWrite.includes(run.taskDir), "neither the run folder itself nor the task folder");
  const fileAllow = s.permissions.allow.filter((r) => /^(Edit|Write)\(/.test(r));
  assert.deepEqual(fileAllow.sort(), ["Edit(/" + wt + "/**)", "Write(/" + wt + "/**)"], "file tools: the run's work tree only");
  for (const r of ["Edit(/" + executor.MARKER + ")", "Write(/" + executor.MARKER + ")", "Write(/" + path.join(wt, ".git") + ")"]) assert.ok(s.permissions.deny.includes(r), "denied: " + r);
  assert.ok(!f.allowWrite.some((p) => p === commonDir || p === live || p === path.join(TMP, "Developer")), "the repository and ~/Developer are not writable");
});

test("a run with no repository: sandbox and file tools write only the run's own folder, never another run's or the marker", () => {
  const run = executor.newRun("3000003");
  const s = JSON.parse(after(executor.execArgs("P", { cwd: run.dir }), "--settings"));
  assert.deepEqual(s.sandbox.filesystem.allowWrite, [run.dir]);
  assert.ok(s.sandbox.filesystem.denyWrite.includes(executor.MARKER));
  assert.deepEqual(s.permissions.allow.filter((r) => /^(Edit|Write)\(/.test(r)).sort(), ["Edit(/" + run.dir + "/**)", "Write(/" + run.dir + "/**)"]);
  assert.equal(executor.MARKER, path.join(TMP, "exec", ".running.json"));
  assert.equal(s.sandbox.enabled, true);
});

test("newRun: a fresh random folder under exec/<task>, never an existing one, and never through a symlinked task folder", () => {
  const a = executor.newRun("5000005"), b = executor.newRun("5000005");
  assert.notEqual(a.dir, b.dir);
  for (const r of [a, b]) {
    assert.match(r.id, /^\d{8}T\d{6}Z-[0-9a-f]{24}$/);
    assert.equal(path.dirname(r.dir), path.join(TMP, "exec", "5000005"));
  }
  fs.mkdirSync(path.join(TMP, "elsewhere"));
  fs.symlinkSync(path.join(TMP, "elsewhere"), path.join(TMP, "exec", "5000006"));
  assert.throws(() => executor.newRun("5000006"), /not a plain folder/);
  assert.throws(() => executor.newRun("../x"), /invalid task id/);
});

test("prepareRepo: a new worktree whose .git file names a folder under the source's worktrees, HEAD on the run's own branch", async () => {
  const live = source("demo2");
  const run = executor.newRun("4000004");
  const repo = await executor.prepareRepo({ repo: "demo2", task_id: "4000004" }, { name: "t" }, run);
  assert.ok(repo.ok, repo.reason);
  assert.equal(repo.commonDir, fs.realpathSync(path.join(live, ".git")));
  assert.equal(path.dirname(repo.gitDir), path.join(repo.commonDir, "worktrees"));
  assert.equal(repo.cwd, path.join(run.dir, "demo2-" + run.id));
  assert.equal(path.basename(repo.gitDir), "demo2-" + run.id, "the worktree's git folder name is unique to the run");
  assert.equal(repo.branch, "chatgpt/4000004-t");
  assert.equal(repo.runRef, "chatgpt-run/4000004/" + run.id);
  assert.equal(fs.readFileSync(path.join(repo.gitDir, "HEAD"), "utf8"), "ref: refs/heads/" + repo.runRef + "\n");
  assert.equal(repo.base, g(live, "rev-parse", "origin/main"));
  assert.equal(repo.url, path.join(TMP, "demo2.git"));
  assert.deepEqual(executor.validateWorktree(repo), { ok: true });
});
