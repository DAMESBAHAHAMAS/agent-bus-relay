// Offline checks of the delegated run's argv and settings (execArgs / execSettings). Real git on a throwaway repository, no Claude run.
// Run: node --test chatgpt/test/exec-sandbox.test.js
const { test } = require("node:test");
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

test("the static settings: no file-tool writes of their own, git --output denied, sandbox on with no unsandboxed escape", () => {
  const s = JSON.parse(fs.readFileSync(executor.SETTINGS, "utf8"));
  const allow = s.permissions.allow, deny = s.permissions.deny;
  assert.equal(s.permissions.defaultMode, "dontAsk");
  assert.ok(!allow.some((r) => /^(Edit|Write)\(~\/Developer/.test(r)), "no Edit/Write allow rule under ~/Developer: " + allow.join(", "));
  assert.ok(!allow.some((r) => /^(Edit|Write)\b/.test(r)), "no static Edit/Write allow rule (not ~/.agent-bus/exec/**): each run gets its own folder only: " + allow.join(", "));
  for (const r of ["Bash(git * --output*)", "Bash(git *--output=*)", "Edit(**/.git/hooks/**)", "Write(**/.git/config)", "Write(~/Developer/agent-bus-relay/**)",
    "Edit(~/.agent-bus/exec/.running.json)", "Write(~/.agent-bus/exec/.running.json)"])
    assert.ok(deny.includes(r), "denied: " + r);
  assert.ok(!allow.some((r) => /^Bash\(git branch:/.test(r)), "git branch is read-only (no prefix rule that admits -D / -f)");
  assert.ok(!allow.some((r) => /git (switch|checkout|push)/.test(r)), "no branch switch or push rule for the model");
  assert.equal(s.sandbox.enabled, true);
  assert.equal(s.sandbox.failIfUnavailable, true);
  assert.equal(s.sandbox.allowUnsandboxedCommands, false);
  assert.equal(s.sandbox.autoAllowBashIfSandboxed, false);
});

test("a repository run: sandbox writes only the worktree's git folder and its own branch; git config, hooks and pointers stay read-only", async () => {
  const src = path.join(TMP, "Developer", "demo");
  fs.mkdirSync(src, { recursive: true }); g(src, "init", "-q"); fs.writeFileSync(path.join(src, "a.txt"), "a\n"); g(src, "add", "a.txt"); g(src, "commit", "-qm", "init");
  const wt = path.join(TMP, "exec", "2000002", "demo");
  fs.mkdirSync(path.dirname(wt), { recursive: true }); g(src, "worktree", "add", "-q", "-b", "chatgpt/2000002-x", wt);
  const [gitDir, commonDir] = g(wt, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir").split("\n");
  const argv = executor.execArgs("PROMPT", { model: "haiku", cwd: wt, repo: { cwd: wt, gitDir, commonDir } });
  assert.ok(!argv.includes("--add-dir"), "~/Developer is not a working directory of the run");
  assert.ok(!argv.includes("bypassPermissions"));
  assert.equal(after(argv, "--permission-mode"), "dontAsk");
  assert.equal(after(argv, "--setting-sources"), "");
  assert.ok(argv.includes("--strict-mcp-config"));
  assert.equal(after(argv, "--tools"), "Read,Glob,Grep,Write,Edit,Bash,WebSearch", "no subagent, scheduler, trigger or messaging tools");
  const s = JSON.parse(after(argv, "--settings"));
  const f = s.sandbox.filesystem;
  const runDir = path.join(TMP, "exec", "2000002");
  assert.deepEqual(f.allowWrite.slice().sort(), [runDir, gitDir, path.join(commonDir, "objects"), path.join(commonDir, "refs", "heads", "chatgpt"),
    path.join(commonDir, "logs", "refs", "heads", "chatgpt")].sort());
  for (const p of [path.join(wt, ".git"), executor.MARKER, path.join(gitDir, "commondir"), path.join(gitDir, "gitdir"), path.join(gitDir, "config.worktree"),
    path.join(commonDir, "config"), path.join(commonDir, "hooks")]) assert.ok(f.denyWrite.includes(p), "sandbox denyWrite: " + p);
  assert.ok(!f.allowWrite.some((p) => p === path.join(TMP, "exec") || (p.startsWith(path.join(TMP, "exec") + path.sep) && p !== runDir)), "nothing else under the exec root is writable");
  const fileAllow = s.permissions.allow.filter((r) => /^(Edit|Write)\(/.test(r));
  assert.deepEqual(fileAllow.sort(), ["Edit(/" + runDir + "/**)", "Write(/" + runDir + "/**)"], "file tools: the run's own folder only");
  for (const r of ["Edit(/" + executor.MARKER + ")", "Write(/" + executor.MARKER + ")"]) assert.ok(s.permissions.deny.includes(r), "denied: " + r);
  assert.ok(!f.allowWrite.some((p) => p === commonDir || p === src || p === path.join(TMP, "Developer")), "the repository and ~/Developer are not writable");
  assert.ok(s.permissions.deny.includes("Write(/" + path.join(wt, ".git") + ")"), "the file tools cannot rewrite the worktree's .git pointer");
});

test("a run with no repository: sandbox and file tools write only the run's own folder, never another run's or the marker", () => {
  const cwd = path.join(TMP, "exec", "3000003");
  const s = JSON.parse(after(executor.execArgs("P", { cwd }), "--settings"));
  assert.deepEqual(s.sandbox.filesystem.allowWrite, [cwd]);
  assert.ok(s.sandbox.filesystem.denyWrite.includes(executor.MARKER));
  assert.deepEqual(s.permissions.allow.filter((r) => /^(Edit|Write)\(/.test(r)).sort(), ["Edit(/" + cwd + "/**)", "Write(/" + cwd + "/**)"]);
  assert.equal(executor.MARKER, path.join(TMP, "exec", ".running.json"));
  assert.equal(s.sandbox.enabled, true);
});

test("runFolder: the first folder under the exec root, or the cwd itself outside it", () => {
  assert.equal(executor.runFolder(path.join(TMP, "exec", "5000005", "demo")), path.join(TMP, "exec", "5000005"));
  assert.equal(executor.runFolder(path.join(TMP, "exec", "5000005")), path.join(TMP, "exec", "5000005"));
  assert.equal(executor.runFolder(path.join(TMP, "elsewhere", "x")), path.join(TMP, "elsewhere", "x"));
  assert.equal(executor.runFolder(path.join(TMP, "exec")), path.join(TMP, "exec"));
});

test("prepareRepo returns the git folders the sandbox needs", async () => {
  const origin = path.join(TMP, "origin2.git"); g(TMP, "init", "-q", "--bare", origin);
  const live = path.join(TMP, "Developer", "demo2");
  g(TMP, "clone", "-q", origin, live); fs.writeFileSync(path.join(live, "r.txt"), "r\n"); g(live, "add", "r.txt"); g(live, "commit", "-qm", "r"); g(live, "push", "-q", "origin", "HEAD");
  const repo = await executor.prepareRepo({ repo: "demo2", task_id: "4000004" }, { name: "t" });
  assert.ok(repo.ok, repo.reason);
  assert.equal(repo.commonDir, fs.realpathSync(path.join(live, ".git")));
  assert.ok(repo.gitDir.startsWith(path.join(repo.commonDir, "worktrees")), repo.gitDir);
});
