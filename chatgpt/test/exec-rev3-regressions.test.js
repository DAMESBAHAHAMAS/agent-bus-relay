// Regression tests for the independent review of P-A2 revision 2 (SA5-T225), findings F1-F5. Each test drives the public
// execute() path (or a public helper) with a stubbed model run on throwaway git repositories under os.tmpdir(): no Claude run,
// no sandbox, no network (ssh is a fake on PATH, origins are local paths). The "model" stub writes what code inside a run could
// write; a "mark" script records whether the BRIDGE ever ran a command the model chose. Each test fails on f68ed31.
// Run: node --test chatgpt/test/exec-rev3-regressions.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exec-rev3-")));
const EXEC = path.join(TMP, "exec"), DEV = path.join(TMP, "Developer"), BIN = path.join(TMP, "bin"), MARKS = path.join(TMP, "marks");
const GITLOG = path.join(TMP, "bridge-git-log");   // one file per call: concurrent calls (pack-objects | index-pack) never interleave
const REAL_GIT = ["/Library/Developer/CommandLineTools/usr/bin/git", "/usr/bin/git"].find((p) => fs.existsSync(p)) || "git";
for (const d of [GITLOG, EXEC, DEV, BIN, MARKS, path.join(TMP, "home"), path.join(TMP, "fakebin")]) fs.mkdirSync(d, { recursive: true });
// Every git command the bridge runs goes through this logging wrapper (BUS_GIT_BIN). Credential values other than the
// test's own sentinel are redacted in the log.
fs.writeFileSync(path.join(BIN, "git-wrapper.sh"), `#!/bin/sh
rec="CALL
C:$PWD
"
for a in "$@"; do rec="$rec""A:$a
"; done
for k in GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_CONFIG_NOSYSTEM GIT_CONFIG_GLOBAL GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_KEY_1 GIT_CONFIG_KEY_2 GIT_CONFIG_KEY_3; do
  eval "v=\\\${$k-__unset__}"; rec="$rec""E:$k=$v
"; done
for i in 0 1 2 3; do eval "v=\\\${GIT_CONFIG_VALUE_$i-__unset__}"; case "$v" in ""|__unset__|*sentinel*) ;; *) v=REDACTED;; esac; rec="$rec""E:GIT_CONFIG_VALUE_$i=$v
"; done
f=$(mktemp '${GITLOG}/c.XXXXXXXX') && printf '%s' "$rec" > "$f"
exec '${REAL_GIT}' "$@"
`, { mode: 0o755 });
fs.writeFileSync(path.join(TMP, "fakebin", "ssh"), "#!/bin/sh\necho \"fake ssh $*\" >> '" + path.join(TMP, "fake-ssh.log") + "'\nexit 1\n", { mode: 0o755 });
fs.writeFileSync(path.join(TMP, "home", ".gitconfig"), "[credential]\n\thelper = test-helper-sentinel\n");
process.env.BUS_GIT_BIN = path.join(BIN, "git-wrapper.sh");
process.env.BUS_EXEC_ROOT = EXEC;
process.env.BUS_DEV_ROOT = DEV;
process.env.BUS_DELEGATION_SWITCH = path.join(TMP, "delegation.on");
process.env.BUS_GIT_FILE_PROTOCOL = "always";   // local-path origins, so that a push the bridge should NOT make is observable
process.env.HOME = path.join(TMP, "home");
process.env.PATH = path.join(TMP, "fakebin") + ":" + process.env.PATH;   // ssh is a fake: no network
delete process.env.BUS_GIT_CREDENTIAL_HELPER;
const executor = require("../executor");

const ID_ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const g = (cwd, ...a) => execFileSync(REAL_GIT, a, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: Object.assign({}, process.env, ID_ENV) }).trim();
const gi = (cwd, input, ...a) => execFileSync(REAL_GIT, a, { cwd, input, encoding: "utf8", env: Object.assign({}, process.env, ID_ENV) }).trim();
function mark(name, { filter = false } = {}) {   // a command that only records that it ran
  const p = path.join(BIN, name + ".sh");
  fs.writeFileSync(p, "#!/bin/sh\necho ran >> '" + path.join(MARKS, name) + "'\n" + (filter ? "cat\n" : "exit 1\n"), { mode: 0o755 });
  return p;
}
const ran = (name) => fs.existsSync(path.join(MARKS, name));
function source(name) {   // a bare origin and Damian's checkout of it under ~/Developer
  const origin = path.join(TMP, name + ".git");
  g(TMP, "init", "-q", "--bare", "-b", "main", origin);
  const live = path.join(DEV, name);
  g(TMP, "clone", "-q", origin, live);
  fs.writeFileSync(path.join(live, "README.md"), name + "\n"); g(live, "add", "README.md"); g(live, "commit", "-qm", "init"); g(live, "push", "-q", "origin", "HEAD:main");
  g(live, "remote", "set-head", "origin", "main");
  return { origin, live };
}
const remoteBranches = (origin) => g(origin, "for-each-ref", "--format=%(refname)", "refs/heads/chatgpt/");
const TASK = (name) => ({ ok: true, open: true, name, status: "Open", project_name: "P", description: "d" });
async function exec(taskId, repo, run, name = "x") {
  const posts = [], updates = [];
  const e = { from: "chatgpt", correlation_id: "cgpt-r3-" + taskId + "-" + Math.random().toString(16).slice(2),
    payload: Object.assign({ kind: "delegated_task", project_id: "1000001", task_id: taskId, instruction: "do it" }, repo ? { repo } : {}) };
  await executor.execute(e, executor.delegation(e), { post: async (type, text) => { posts.push({ type, text }); return { status: 201 }; },
    claudeBin: "unused", childEnv: process.env, check: async () => TASK(name), update: async (...a) => { updates.push(a); return { ok: true, fields_written: [] }; }, run });
  return { posts, updates, last: posts.length ? posts[posts.length - 1].text : "" };
}
const commit = (cwd, file, text) => { fs.writeFileSync(path.join(cwd, file), text); g(cwd, "add", file); g(cwd, "commit", "-qm", "add " + file); return g(cwd, "rev-parse", "HEAD"); };
const gitlink = (cwd, p) => { g(cwd, "update-index", "--add", "--cacheinfo", "160000," + g(cwd, "rev-parse", "HEAD") + "," + p); g(cwd, "commit", "-qm", "gitlink " + p); return g(cwd, "rev-parse", "HEAD"); };

before(() => fs.writeFileSync(process.env.BUS_DELEGATION_SWITCH, "on"));
after(() => { if (!process.env.KEEP_TMP) fs.rmSync(TMP, { recursive: true, force: true }); else console.log("kept", TMP); });

// ---------- F1 (High): worktree integrity ----------
test("F1: a folder planted at exec/<task>/<repo> by an earlier run is never reused, and its config never runs", async () => {
  source("r1a");
  const planted = path.join(EXEC, "7100001", "r1a"), m = mark("f1a-sshcommand");
  fs.mkdirSync(path.dirname(planted), { recursive: true });
  g(TMP, "init", "-q", "-b", "chatgpt/7100001-x", planted);   // a forged repository, as a run of the same task could leave it
  commit(planted, "f.txt", "forged\n");
  g(planted, "update-ref", "refs/remotes/origin/main", "HEAD");
  g(planted, "config", "core.sshCommand", m); g(planted, "config", "remote.origin.url", "ssh://127.0.0.1:9/forged");
  let cwd;
  const { last } = await exec("7100001", "r1a", async (bin, text, c) => { cwd = c; return { ok: true, text: "nothing\nSTATUS: COMPLETE" }; });
  assert.ok(!ran("f1a-sshcommand"), "the bridge ran the forged repository's core.sshCommand");
  assert.notEqual(cwd, planted, "the planted folder was reused as the run's worktree");
  assert.doesNotMatch(last, /forged/);
});

test("F1: a worktree whose .git pointer is changed during the run is refused, and the forged config never runs", async () => {
  const { origin } = source("r1b");
  const m = mark("f1b-sshcommand");
  const { last, updates } = await exec("7100002", "r1b", async (bin, text, cwd) => {
    commit(cwd, "ok.js", "1\n");
    const evil = path.join(cwd, "evil.git");
    g(TMP, "init", "-q", "--bare", evil);
    g(evil, "config", "core.sshCommand", m); g(evil, "config", "remote.origin.url", "ssh://127.0.0.1:9/forged");
    fs.writeFileSync(path.join(cwd, ".git"), "gitdir: " + evil + "\n");   // denied by the sandbox; simulated as if a gap allowed it
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.ok(!ran("f1b-sshcommand"), "the bridge ran the forged git folder's core.sshCommand");
  assert.match(last, /STATUS: BLOCKED/);
  assert.match(last, /failed validation/);
  assert.equal(updates.length, 0, "no Zoho write-back");
  assert.equal(remoteBranches(origin), "", "nothing pushed");
});

test("F1: validateWorktree refuses a symlinked work tree, a .git folder, a foreign gitdir, a bad back-pointer or commondir, a moved HEAD and config.worktree", async () => {
  assert.equal(typeof executor.validateWorktree, "function", "validateWorktree is missing");
  source("r1c");
  const fresh = async (id) => { const r = await executor.prepareRepo({ repo: "r1c", task_id: id }, { name: "x" }, executor.newRun(id)); assert.ok(r.ok, r.reason); assert.ok(executor.validateWorktree(r).ok); return r; };
  const cases = [
    ["symlinked work tree", (r) => { const moved = r.cwd + ".real"; fs.renameSync(r.cwd, moved); fs.symlinkSync(moved, r.cwd); }],
    [".git is a folder", (r) => { fs.rmSync(path.join(r.cwd, ".git")); fs.mkdirSync(path.join(r.cwd, ".git")); }],
    [".git points elsewhere", (r) => { const other = path.join(TMP, "other-" + r.runId); g(TMP, "init", "-q", other); fs.writeFileSync(path.join(r.cwd, ".git"), "gitdir: " + path.join(other, ".git") + "\n"); }],
    ["back-pointer moved", (r) => fs.writeFileSync(path.join(r.gitDir, "gitdir"), path.join(TMP, "elsewhere", ".git") + "\n")],
    ["commondir moved", (r) => { const other = path.join(TMP, "oc-" + r.runId); g(TMP, "init", "-q", other); fs.writeFileSync(path.join(r.gitDir, "commondir"), path.join(other, ".git") + "\n"); }],
    ["HEAD detached", (r) => fs.writeFileSync(path.join(r.gitDir, "HEAD"), g(r.cwd, "rev-parse", "HEAD") + "\n")],
    ["HEAD on another branch", (r) => fs.writeFileSync(path.join(r.gitDir, "HEAD"), "ref: refs/heads/chatgpt/7999999-other\n")],
    ["config.worktree present", (r) => fs.writeFileSync(path.join(r.gitDir, "config.worktree"), "[core]\n\tsshCommand = x\n")],
  ];
  let i = 0;
  for (const [what, tamper] of cases) {
    const r = await fresh(String(7100100 + ++i));
    tamper(r);
    const v = executor.validateWorktree(r);
    assert.equal(v.ok, false, what);
    const s = await executor.branchSafety(r);
    assert.equal(s.ok, false, what + ": branchSafety refuses too");
  }
});

// ---------- F2 (High): git configuration that runs code ----------
test("F2: core.sshCommand in the repository config never runs from bridge git (fetch, ls-remote, push)", async () => {
  const { live } = source("r2a");
  const m = mark("f2a-sshcommand");
  g(live, "config", "core.sshCommand", m); g(live, "config", "remote.origin.url", "ssh://127.0.0.1:9/r2a");
  await exec("7200001", "r2a", async (bin, text, cwd) => { commit(cwd, "ok.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.ok(!ran("f2a-sshcommand"), "the bridge ran core.sshCommand from repository config");
});

test("F2: an ext:: transport allowed by repository config never runs from bridge git", async () => {
  const { live } = source("r2c");
  const m = mark("f2c-ext");
  g(live, "config", "protocol.ext.allow", "always"); g(live, "config", "remote.origin.url", "ext::" + m + " %S x");
  await exec("7200003", "r2c", async (bin, text, cwd) => { commit(cwd, "ok.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.ok(!ran("f2c-ext"), "the bridge ran an ext:: transport command");
});

test("F2: a filter driver selected by a model-written .gitattributes never runs in the bridge's status check", async () => {
  const { live } = source("r2b");
  g(live, "config", "filter.evil.clean", mark("f2b-filter", { filter: true }));
  g(live, "config", "filter.lfs.clean", mark("f2b-lfs", { filter: true })); g(live, "config", "filter.lfs.process", mark("f2b-lfsproc"));
  const { last } = await exec("7200002", "r2b", async (bin, text, cwd) => {
    // committed with plumbing only, so the model's own git never hashes a file through the filter
    const attrs = gi(cwd, "*.txt filter=evil\n*.bin filter=lfs\n", "hash-object", "-w", "--no-filters", "--stdin");
    const blob = gi(cwd, "aaaa\n", "hash-object", "-w", "--no-filters", "--stdin");
    for (const [p, b] of [[".gitattributes", attrs], ["a.txt", blob], ["b.bin", blob]]) g(cwd, "update-index", "--add", "--cacheinfo", "100644," + b + "," + p);
    const c = g(cwd, "commit-tree", g(cwd, "write-tree"), "-p", "HEAD", "-m", "attrs");
    g(cwd, "update-ref", "HEAD", c);
    fs.writeFileSync(path.join(cwd, ".gitattributes"), "*.txt filter=evil\n*.bin filter=lfs\n");
    fs.writeFileSync(path.join(cwd, "a.txt"), "aaaa\n"); fs.writeFileSync(path.join(cwd, "b.bin"), "aaaa\n");   // index has no stat data: status must hash them
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  for (const n of ["f2b-filter", "f2b-lfs", "f2b-lfsproc"]) assert.ok(!ran(n), "the bridge ran filter " + n);
  assert.match(last, /BRIDGE-VERIFIED EVIDENCE/);
});

// ---------- F3 (High): per-run isolation and git metadata ----------
test("F3: two runs of one task get different, fresh run folders, and neither can write the other's", async () => {
  const seen = [];
  for (let i = 0; i < 2; i++) {
    await exec("7300001", undefined, async (bin, text, cwd) => {
      seen.push({ cwd, s: JSON.parse(executor.execArgs(text, { cwd }).at(executor.execArgs(text, { cwd }).indexOf("--settings") + 1)) });
      return { ok: true, text: "done\nSTATUS: COMPLETE" };
    });
  }
  assert.notEqual(seen[0].cwd, seen[1].cwd, "the second run reused the first run's folder");
  for (const { cwd, s } of seen) {
    assert.equal(path.dirname(cwd), path.join(EXEC, "7300001"));
    assert.match(path.basename(cwd), /^\d{8}T\d{6}Z-[0-9a-f]{24}$/, "an unguessable run id");
    assert.deepEqual(s.sandbox.filesystem.allowWrite, [cwd]);
  }
  assert.ok(!seen[1].s.sandbox.filesystem.allowWrite.some((p) => seen[0].cwd.startsWith(p)), "the second run can write the first run's folder");
});

test("F3: a repository run cannot write HEAD, refs, config, pointers, shared objects or any task branch; the bridge moves the task branch", async () => {
  const { live, origin } = source("r3b");
  let cap;
  await exec("7300002", "r3b", async (bin, text, cwd, runEnv, repo) => {
    const argv = executor.execArgs(text, { cwd, repo });
    cap = { cwd, head: g(cwd, "symbolic-ref", "HEAD"), s: JSON.parse(argv[argv.indexOf("--settings") + 1]),
      gitDir: fs.realpathSync(path.resolve(cwd, fs.readFileSync(path.join(cwd, ".git"), "utf8").replace(/^gitdir: /, "").trim())) };
    commit(cwd, "ok.js", "1\n");
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  }, "Branch Owner");
  const commonDir = fs.realpathSync(path.join(live, ".git"));
  const gitDir = cap.gitDir;
  const f = cap.s.sandbox.filesystem, taskBranch = "refs/heads/chatgpt/7300002-branch-owner";
  assert.notEqual(cap.head, taskBranch, "the model's HEAD is not the task branch the bridge pushes");
  const ownRef = path.join(commonDir, cap.head);
  for (const p of f.allowWrite.filter((x) => x.startsWith(path.join(commonDir, "refs") + path.sep) || x === path.join(commonDir, "refs")))
    assert.ok(p === ownRef || p === ownRef + ".lock", "writable ref path other than the run's own: " + p);
  assert.ok(!f.allowWrite.includes(path.join(commonDir, "objects")), "the shared objects are writable");
  assert.ok(!f.allowWrite.includes(path.join(EXEC, "7300002")), "the whole task folder is writable");
  for (const x of ["HEAD", "refs", "config", "commondir", "gitdir", "config.worktree"]) assert.ok(f.denyWrite.includes(path.join(gitDir, x)), "not denied: gitDir/" + x);
  assert.equal(g(live, "rev-parse", taskBranch), g(origin, "rev-parse", taskBranch), "the bridge moved the task branch to the sha it pushed");
});

// ---------- F4 (Medium): exact sha validation ----------
test("F4: a detached HEAD on a clean commit cannot carry a branch ref that points at a gitlink commit", async () => {
  const { origin } = source("r4a");
  const { last, updates } = await exec("7400001", "r4a", async (bin, text, cwd) => {
    const br = g(cwd, "symbolic-ref", "HEAD");
    const clean = commit(cwd, "ok.js", "1\n"), bad = gitlink(cwd, "sub");
    g(cwd, "checkout", "-q", "--detach", clean);
    assert.equal(g(cwd, "rev-parse", br), bad);
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.equal(remoteBranches(origin), "", "the gitlink commit was pushed");
  assert.match(last, /STATUS: BLOCKED/);
  assert.equal(updates.length, 0);
});

test("F4: a gitlink added in one commit and removed in the next is refused (every commit is checked, not just the endpoints)", async () => {
  const { origin } = source("r4b");
  const { last } = await exec("7400002", "r4b", async (bin, text, cwd) => {
    gitlink(cwd, "sub"); g(cwd, "rm", "-q", "--cached", "sub"); commit(cwd, "ok.js", "1\n");
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.equal(remoteBranches(origin), "", "an intermediate gitlink commit was pushed");
  assert.match(last, /REFUSED: the branch adds or changes a gitlink.*sub/);
  assert.match(last, /STATUS: BLOCKED/);
});

test("F4: commits already on an existing task branch are checked from the trusted fork point, not from the branch tip", async () => {
  const { live, origin } = source("r4c");
  const idx = path.join(TMP, "r4c-index"), env = Object.assign({}, process.env, ID_ENV, { GIT_INDEX_FILE: idx });   // an earlier, refused run's commit
  execFileSync(REAL_GIT, ["read-tree", "main"], { cwd: live, env });
  execFileSync(REAL_GIT, ["update-index", "--add", "--cacheinfo", "160000," + g(live, "rev-parse", "main") + ",planted"], { cwd: live, env });
  const tree = execFileSync(REAL_GIT, ["write-tree"], { cwd: live, env, encoding: "utf8" }).trim();
  g(live, "update-ref", "refs/heads/chatgpt/7400003-planted", g(live, "commit-tree", tree, "-p", "main", "-m", "planted gitlink"));
  const { last } = await exec("7400003", "r4c", async (bin, text, cwd) => { commit(cwd, "ok.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; }, "Planted");
  assert.equal(remoteBranches(origin), "", "the earlier refused commit was pushed under a later clean one");
  assert.match(last, /STATUS: BLOCKED/);
});

test("F4: path variants git treats as .git or .gitmodules (NTFS streams, backslashes, 8.3 names) are refused", () => {
  for (const p of [".git::$INDEX_ALLOCATION", "a/.git::$INDEX_ALLOCATION/config", "git~1:x", "a\\.git\\config", "a\\.GIT.\\hooks", ".gitmodules::$DATA",
    "gitmod~1", "GITMOD~4", "gi7eba~1", "GI7EBA~9", "x/gitmod~2", ".git:", "git~2"]) assert.ok(executor.isGitPath(p), p);
  for (const p of ["a.git", ".github/x", ".gitignore", ".gitattributes", "x/git/y", "dotgit", "gitmodules.txt", "a:b/c"]) assert.ok(!executor.isGitPath(p), p);
});

test("F4: an empty .git folder in a commit (only visible with diff-tree -t) is refused", async () => {
  const { origin } = source("r4d");
  const { last } = await exec("7400004", "r4d", async (bin, text, cwd) => {
    const empty = gi(cwd, "", "hash-object", "-w", "-t", "tree", "--stdin");
    const sub = gi(cwd, "040000 tree " + empty + "\t.git\n", "mktree");
    const top = gi(cwd, g(cwd, "ls-tree", "HEAD") + "\n040000 tree " + sub + "\tx\n", "mktree");
    g(cwd, "update-ref", "HEAD", g(cwd, "commit-tree", top, "-p", "HEAD", "-m", "empty .git"));
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.equal(remoteBranches(origin), "", "a commit with an empty .git folder was pushed");
  assert.match(last, /STATUS: BLOCKED/);
});

test("F4: a run cannot retarget a later push to another task's branch through the worktree HEAD", async () => {
  const { origin } = source("r4e");
  const first = await exec("7400005", "r4e", async (bin, text, cwd) => {   // leaves HEAD on another task's branch name
    g(cwd, "checkout", "-q", "-b", "chatgpt/7999999-other"); commit(cwd, "other.js", "2\n");
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  await exec("7400005", "r4e", async () => ({ ok: true, text: "nothing to do\nSTATUS: COMPLETE" }));   // a retry of the same task
  assert.doesNotMatch(remoteBranches(origin), /7999999-other/, "pushed to another task's branch");
  assert.match(first.last, /STATUS: BLOCKED/);
});

// ---------- Findings from the code review of revision 3 itself (pre-commit). These guard rev 3's own design; they are not
// F1-F5 regressions and some of them pass on f68ed31 too. ----------
test("R3-review: after every run the live repository holds no run branch, no run worktree and no object it cannot find (fsck and repack pass)", async () => {
  const { live } = source("q1");
  await exec("7500001", "q1", async (bin, text, cwd, runEnv) => {   // the model's git with the bridge's environment: objects in the run folder
    const mg = (...a) => execFileSync(REAL_GIT, a, { cwd, encoding: "utf8", env: Object.assign({}, runEnv, ID_ENV) });
    fs.writeFileSync(path.join(cwd, "ok.js"), "1\n"); mg("add", "ok.js"); mg("commit", "-qm", "ok");
    fs.writeFileSync(path.join(cwd, "staged.js"), "2\n"); mg("add", "staged.js");   // staged, never committed
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  const refused = await exec("7500001", "q1", async (bin, text, cwd, runEnv) => {
    const mg = (...a) => execFileSync(REAL_GIT, a, { cwd, encoding: "utf8", env: Object.assign({}, runEnv, ID_ENV) });
    mg("update-index", "--add", "--cacheinfo", "160000," + mg("rev-parse", "HEAD").trim() + ",sub"); mg("commit", "-qm", "gitlink");
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.match(refused.last, /STATUS: BLOCKED/);
  assert.equal(g(live, "for-each-ref", "refs/heads/chatgpt-run/"), "", "no run branch left");
  assert.equal(g(live, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length, 1, "no run worktree registered");
  g(live, "fsck", "--no-dangling", "--no-progress");
  g(live, "repack", "-a", "-d", "-q");
  const runs = fs.readdirSync(path.join(EXEC, "7500001"));
  assert.equal(runs.length, 2);
  for (const r of runs) for (const f of ["run-branch.txt", "worktree-git", "q1-" + r, "objects"]) assert.ok(fs.existsSync(path.join(EXEC, "7500001", r, f)), "kept as evidence: " + f);
});

test("R3-review: a run ref or listed file swapped for a symlink or FIFO is never read through by the bridge", async () => {
  const { live } = source("q5");
  const secret = path.join(TMP, "secret.txt"); fs.writeFileSync(secret, "TOPSECRET-should-never-be-copied\n");
  let runDir;
  const { last } = await exec("7500005", "q5", async (bin, text, cwd) => {
    runDir = path.dirname(cwd);
    const ref = path.join(live, ".git", g(cwd, "symbolic-ref", "HEAD"));
    fs.unlinkSync(ref); fs.symlinkSync(secret, ref);
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.match(last, /STATUS: BLOCKED/);
  assert.doesNotMatch(fs.readFileSync(path.join(runDir, "run-branch.txt"), "utf8"), /TOPSECRET/);
  assert.equal(g(live, "for-each-ref", "refs/heads/chatgpt-run/"), "");
  assert.equal(executor.readPlain(path.join(runDir, "nope")), null);
  const fifo = path.join(TMP, "fifo"); execFileSync("mkfifo", [fifo]);
  assert.equal(executor.readPlain(fifo), null, "a FIFO is refused without blocking");
  const link = path.join(TMP, "link"); fs.symlinkSync(secret, link);
  assert.equal(executor.readPlain(link), null, "a symlink is refused");
  const np = await exec("7500006", undefined, async (bin, text, cwd) => { fs.symlinkSync(secret, path.join(cwd, "listed.txt")); fs.writeFileSync(path.join(cwd, "real.txt"), "r\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.doesNotMatch(np.last, /listed\.txt/, "a symlink in the work folder is not hashed through");
  assert.match(np.last, /real\.txt \(2 bytes/);
});

test("R3-review: runClaude kills processes a run left behind, even in their own process group, so they stop writing", async () => {
  const fake = path.join(BIN, "fake-claude.js"), late = path.join(TMP, "late-write.txt");
  fs.writeFileSync(fake, "#!" + process.execPath + "\nconst { spawn } = require('child_process');\n" +
    "spawn(process.execPath, ['-e', \"setTimeout(() => require('fs').writeFileSync(" + JSON.stringify(late).replace(/"/g, "'") + ", 'late'), 2500)\"], { detached: true, stdio: 'ignore' }).unref();\n" +
    "setTimeout(() => console.log(JSON.stringify({ result: 'ok\\nSTATUS: COMPLETE', subtype: 'success' })), 1000);\n", { mode: 0o755 });
  const run = executor.newRun("7500007");
  const r = await executor.runClaude(fake, "P", run.dir, process.env, null, { sampleMs: 200 });
  assert.equal(r.ok, true, JSON.stringify(r));
  await new Promise((res) => setTimeout(res, 3500));
  assert.ok(!fs.existsSync(late), "a detached background process outlived the run and wrote after it");
});

test("R3-review: a symbolic task branch is refused and never followed (the live main does not move)", async () => {
  const { live, origin } = source("q2");
  const main = g(live, "rev-parse", "main");
  g(live, "symbolic-ref", "refs/heads/chatgpt/7500002-x", "refs/heads/main");   // as a rev 2 run could leave it
  let ran2 = false;
  const { last } = await exec("7500002", "q2", async (bin, text, cwd) => { ran2 = true; commit(cwd, "ok.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.equal(ran2, false);
  assert.match(last, /STATUS: BLOCKED: the task branch .* is a symbolic ref/);
  assert.equal(g(live, "rev-parse", "main"), main);
  assert.equal(remoteBranches(origin), "");
});

test("R3-review: a run branch that is a symbolic ref, rewinds the task branch, or comes with a planted object alternate is refused", async () => {
  const { live, origin } = source("q3");
  await exec("7500003", "q3", async (bin, text, cwd) => { commit(cwd, "a.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  const pushed = g(origin, "rev-parse", "refs/heads/chatgpt/7500003-x"), main = g(live, "rev-parse", "main");
  const cases = [
    ["symbolic run branch", (cwd) => { const ref = g(cwd, "symbolic-ref", "HEAD"); fs.writeFileSync(path.join(live, ".git", ref), "ref: refs/heads/main\n"); }],
    ["rewind", (cwd) => { const c = g(cwd, "commit-tree", g(cwd, "rev-parse", "main^{tree}"), "-p", "main", "-m", "drops a.js"); g(cwd, "update-ref", "HEAD", c); }],
    ["planted alternate", (cwd, runEnv) => { commit(cwd, "b.js", "2\n"); fs.writeFileSync(path.join(runEnv.GIT_OBJECT_DIRECTORY, "info", "alternates"), path.join(TMP, "x") + "\n"); }],
  ];
  for (const [what, act] of cases) {
    const { last } = await exec("7500003", "q3", async (bin, text, cwd, runEnv) => { act(cwd, runEnv); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
    assert.match(last, /STATUS: BLOCKED/, what);
    assert.equal(g(origin, "rev-parse", "refs/heads/chatgpt/7500003-x"), pushed, what + ": origin unchanged");
    assert.equal(g(live, "rev-parse", "refs/heads/chatgpt/7500003-x"), pushed, what + ": the task branch unchanged");
    assert.equal(g(live, "rev-parse", "main"), main, what + ": main unchanged");
  }
});

test("R3-review: an untracked file the model forgot to add is reported, not hidden", async () => {
  source("q4");
  const { last } = await exec("7500004", "q4", async (bin, text, cwd) => { fs.writeFileSync(path.join(cwd, "forgot.js"), "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.match(last, /working tree: 1 uncommitted change\(s\)/);
});

test("R3-review: the HFS-ignorable character class is written as escapes, not invisible characters", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "executor.js"), "utf8");
  assert.ok(src.includes("const IGNORABLE = /[\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\ufeff]/g;"));
  assert.ok(!/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/.test(src), "no invisible characters in executor.js");
  assert.ok(executor.isGitPath(".g\u200cit/x") && executor.isGitPath(".gitmodules\ufeff"));
});

test("R3-review: a run whose loose object content does not match its name is refused (outcome test; git's own hash check and the quarantine both stop it)", async () => {
  const { origin } = source("q6");
  const { last } = await exec("7500008", "q6", async (bin, text, cwd, runEnv) => {
    const mg = (...a) => execFileSync(REAL_GIT, a, { cwd, encoding: "utf8", env: Object.assign({}, runEnv, ID_ENV) }).trim();
    mg("update-index", "--add", "--cacheinfo", "160000," + mg("rev-parse", "HEAD") + ",sub");
    const bad = mg("write-tree"), clean = mg("rev-parse", "HEAD^{tree}");
    mg("update-ref", "HEAD", mg("commit-tree", bad, "-p", "HEAD", "-m", "gitlink behind a forged tree object"));
    mg("read-tree", clean);   // the index shows nothing either
    // the gitlink tree's loose file now holds the clean tree's bytes: a reader that trusts names would see no gitlink
    const body = execFileSync(REAL_GIT, ["cat-file", "tree", clean], { cwd, env: Object.assign({}, runEnv) });
    const file = path.join(runEnv.GIT_OBJECT_DIRECTORY, bad.slice(0, 2), bad.slice(2));
    fs.chmodSync(file, 0o644); fs.writeFileSync(file, require("node:zlib").deflateSync(Buffer.concat([Buffer.from("tree " + body.length + "\0"), body])));
    return { ok: true, text: "done\nSTATUS: COMPLETE" };
  });
  assert.match(last, /STATUS: BLOCKED/);
  assert.equal(remoteBranches(origin), "");
});

test("R3-review: a checked branch whose push fails ends BLOCKED, the task branch does not move and Zoho is not written", async () => {
  const { live } = source("q7");
  g(live, "config", "remote.origin.url", path.join(TMP, "no-such-origin.git"));
  const { last, updates } = await exec("7500009", "q7", async (bin, text, cwd) => { commit(cwd, "ok.js", "1\n"); return { ok: true, text: "done\nSTATUS: COMPLETE" }; });
  assert.match(last, /STATUS: BLOCKED: the bridge checked the branch but could not push it/);
  assert.equal(updates.length, 0);
  assert.equal(g(live, "for-each-ref", "refs/heads/chatgpt/"), "", "the local task branch was not created");
});

test("R3-review: the marker names the run's repository, run ref and git folder before git worktree add, and again after it", async () => {
  source("q8");
  const seen = [];
  const run = executor.newRun("7500010");
  const repo = await executor.prepareRepo({ repo: "q8", task_id: "7500010" }, { name: "x" }, run,
    { beforeAdd: (r) => seen.push({ runRef: r.runRef, gitDir: r.gitDir, exists: fs.existsSync(r.cwd) }) });
  assert.ok(repo.ok, repo.reason);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].exists, false, "first call before the worktree exists");
  assert.equal(seen[0].runRef, repo.runRef);
  assert.equal(seen[1].gitDir, repo.gitDir, "second call with the git folder git made");
});

test("R3-review: processes a run left are killed even when started by a process that was already reparented, and after a bridge restart", async () => {
  const late = path.join(TMP, "late-grandchild.txt"), fake = path.join(BIN, "fake-claude-2.js");
  const B = "setTimeout(() => require('fs').writeFileSync(" + JSON.stringify(late).replace(/"/g, "'") + ", 'late'), 3000)";
  const A = "setTimeout(() => require('child_process').spawn(process.execPath, ['-e', " + JSON.stringify(B) + "], { detached: true, stdio: 'ignore' }).unref(), 1000); setTimeout(() => {}, 4000)";
  const T = "require('child_process').spawn(process.execPath, ['-e', " + JSON.stringify(A) + "], { detached: true, stdio: 'ignore' }).unref(); setTimeout(() => {}, 500)";
  fs.writeFileSync(fake, "#!" + process.execPath + "\nrequire('child_process').spawn(process.execPath, ['-e', " + JSON.stringify(T) + "], { stdio: 'ignore' });\n" +
    "setTimeout(() => console.log(JSON.stringify({ result: 'ok', subtype: 'success' })), 2000);\n", { mode: 0o755 });
  const r = await executor.runClaude(fake, "P", executor.newRun("7500011").dir, process.env, null, { sampleMs: 200 });
  assert.equal(r.reaped, true);
  await new Promise((res) => setTimeout(res, 3500));
  assert.ok(!fs.existsSync(late), "a grandchild started by a reparented process outlived the run");
  // after a restart: the recorded processes in .running-pids.json are killed by recoverInterrupted
  const { spawn } = require("node:child_process");
  const orphan = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { detached: true, stdio: "ignore" }); orphan.unref();
  await new Promise((res) => setTimeout(res, 300));
  const row = execFileSync("/bin/ps", ["-o", "pgid=", "-o", "lstart=", "-p", String(orphan.pid)], { encoding: "utf8" }).trim().match(/^(\d+)\s+(.+)$/);
  fs.writeFileSync(executor.PIDS, JSON.stringify([{ pid: orphan.pid, start: row[2], pgid: Number(row[1]) }]));
  fs.writeFileSync(executor.MARKER, JSON.stringify({ cid: "c-restart", task_id: "7500011", at: "t" }));
  const notices = [];
  await executor.recoverInterrupted(async (cid, type, text) => notices.push(cid));
  await new Promise((res) => setTimeout(res, 300));
  let alive = true; try { process.kill(orphan.pid, 0); } catch (e) { alive = false; }
  assert.equal(alive, false, "the recorded process survived the restart recovery");
  assert.deepEqual(notices, ["c-restart"]);
  assert.ok(!fs.existsSync(executor.PIDS));
});

test("R3-review: a repository with no remote.origin.url is refused before the run; killRecorded never signals the bridge's own process group", async () => {
  const { live } = source("q9");
  g(live, "remote", "remove", "origin");
  let ran9 = false;
  const { last } = await exec("7500012", "q9", async () => { ran9 = true; return { ok: true, text: "x\nSTATUS: COMPLETE" }; });
  assert.equal(ran9, false);
  assert.match(last, /STATUS: BLOCKED: repo q9 has no remote.origin.url/);
  const { spawn } = require("node:child_process");
  const same = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });   // in this (the "bridge's") process group
  await new Promise((res) => setTimeout(res, 300));
  const row = execFileSync("/bin/ps", ["-o", "pgid=", "-o", "lstart=", "-p", String(same.pid)], { encoding: "utf8" }).trim().match(/^(\d+)\s+(.+)$/);
  const ownGroup = Number(execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" }).trim());
  assert.equal(Number(row[1]), ownGroup);
  const seen = new Map([[same.pid, { start: row[2], pgid: ownGroup }], [ownGroup, { start: "not this process", pgid: ownGroup }]]);
  assert.equal(await executor.killRecorded(seen), true);
  await new Promise((res) => setTimeout(res, 300));
  let alive = true; try { process.kill(same.pid, 0); } catch (e) { alive = false; }
  assert.equal(alive, false, "the recorded process itself is killed");   // and this test process is still running
});

// ---------- F2/F5 and R6: every bridge git call, as the logging wrapper saw it (runs last: it reads the whole log) ----------
const REQUIRED = ["core.fsmonitor=false", "core.hooksPath=/dev/null", "core.sshCommand=ssh", "core.askPass=", "core.pager=cat", "diff.external=",
  "filter.lfs.process=", "protocol.allow=never", "protocol.ext.allow=never", "submodule.recurse=false", "core.attributesFile=/dev/null",
  "core.commitGraph=false", "core.multiPackIndex=false"];
test("F2/F5: every bridge git call is hardened and pinned; credentials only on push/ls-remote/fetch, in the environment, never argv; pushes name a checked sha and the source URL", () => {
  const calls = fs.readdirSync(GITLOG).map((f) => fs.readFileSync(path.join(GITLOG, f), "utf8").replace(/^CALL\n/, "")).map((rec) => {
    const c = { args: [], env: {} };
    for (const line of rec.split("\n")) {
      if (line.startsWith("C:")) c.cwd = line.slice(2);
      else if (line.startsWith("A:")) c.args.push(line.slice(2));
      else if (line.startsWith("E:")) { const i = line.indexOf("="); c.env[line.slice(2, i)] = line.slice(i + 1); }
    }
    let i = 0; const cfg = [];
    while (i < c.args.length && c.args[i].startsWith("-")) { if (c.args[i] === "-c") { cfg.push(c.args[i + 1]); i += 2; } else i += 1; }
    return Object.assign(c, { cfg, sub: c.args[i], rest: c.args.slice(i + 1) });
  });
  assert.ok(calls.length > 50, "the wrapper saw the bridge's git calls: " + calls.length);
  const credRead = calls.filter((c) => c.sub === "config" && c.rest.some((a) => /^--(system|global)$/.test(a)));
  const others = calls.filter((c) => !credRead.includes(c));
  assert.ok(credRead.every((c) => c.cwd === "/"), "credential read at /");
  const problems = new Set();
  const check = (cond, what) => { if (!cond) problems.add(what); };
  check(calls.filter((c) => c.sub === "config" && c.rest.includes("--get-regexp")).every((c) => credRead.includes(c)), "credential config read without --system/--global scope");
  for (const c of others) {
    const where = c.sub;
    check(c.args.includes("--attr-source=4b825dc642cb6eb9a060e54bf8d69288fbee4904"), "no --attr-source=<empty tree> (attributes can select filters): " + where);
    for (const k of REQUIRED) check(c.cfg.includes(k), "missing -c " + k + ": " + where);
    check(c.env.GIT_CONFIG_NOSYSTEM === "1" && c.env.GIT_CONFIG_GLOBAL === "/dev/null", "system/global config not off: " + where);
    check(c.env.GIT_DIR !== "__unset__", "GIT_DIR not pinned (repository found by discovery): " + where);
    check(!c.cfg.some((k) => /^credential\./i.test(k)), "credential setting on argv: " + where);
    check(c.env.GIT_CONFIG_KEY_0 === "credential.helper" && c.env.GIT_CONFIG_VALUE_0 === "", "helper list not cleared first in the environment: " + where);
    if (c.env.GIT_WORK_TREE !== "__unset__" || (c.cwd || "").startsWith(EXEC)) {
      check(c.env.GIT_DIR.startsWith(DEV) && c.env.GIT_DIR.includes("/.git/worktrees/") && c.env.GIT_WORK_TREE !== "__unset__" && c.env.GIT_COMMON_DIR !== "__unset__",
        "worktree call not pinned to GIT_DIR under ~/Developer/<repo>/.git/worktrees with GIT_WORK_TREE and GIT_COMMON_DIR: " + where);
    } else check(c.env.GIT_DIR.startsWith(DEV) && c.env.GIT_DIR.endsWith("/.git"), "source call not pinned to ~/Developer/<repo>/.git: " + where);
    const transport = ["push", "ls-remote", "fetch"].includes(c.sub);
    const owner = Object.keys(c.env).filter((k) => /^GIT_CONFIG_VALUE_/.test(k) && /sentinel/.test(c.env[k]));
    if (transport) {
      check(owner.length === 1, "owner's credential helper not passed in the environment: " + where);
      check(!c.rest.includes("origin"), "transport by the remote name 'origin' (worktree or repository insteadOf/url): " + where);
    } else check(owner.length === 0, "credential config on a non-transport call: " + where);
    if (c.sub === "push") {
      const spec = c.rest[c.rest.length - 1];
      check(/^[0-9a-f]{40}:refs\/heads\/chatgpt\/\d+-[a-z0-9-]+$/.test(spec), "push refspec is not <checked sha>:refs/heads/<task branch>");
      check(!c.rest.some((a) => a === "--force" || a === "-f" || a.startsWith("+")), "forced push");
    }
  }
  assert.deepEqual([...problems].sort(), [], "unhardened bridge git calls");
  assert.ok(others.some((c) => c.sub === "push"), "at least one push was logged");
});
