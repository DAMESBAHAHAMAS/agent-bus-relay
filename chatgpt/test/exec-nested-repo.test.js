// Offline checks that the bridge's own (unsandboxed) git commands cannot be made to run code the model wrote: a nested repository
// committed as a gitlink, with core.fsmonitor set in its own config, made with `git init --separate-git-dir` or by hand (a gitdir
// folder plus a .git file). Real git on throwaway repositories, no Claude run. Each chain is first shown live with plain git.
// Run: node --test chatgpt/test/exec-nested-repo.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exec-nested-")));
process.env.BUS_EXEC_ROOT = path.join(TMP, "exec");
process.env.BUS_DEV_ROOT = path.join(TMP, "Developer");
process.env.BUS_DELEGATION_SWITCH = path.join(TMP, "delegation.on");
delete process.env.BUS_GIT_FILE_PROTOCOL;   // this file checks the default: protocol.file.allow=never
const executor = require("../executor");

const ID_ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
// The model's side: plain git, as code run inside the sandbox would use it.
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: Object.assign({}, process.env, ID_ENV) }).trim();
const ORIGIN = path.join(TMP, "origin.git");
const LIVE = path.join(TMP, "Developer", "demo");
let n = 0;

before(() => {
  fs.writeFileSync(process.env.BUS_DELEGATION_SWITCH, "on");
  g(TMP, "init", "-q", "--bare", "-b", "main", ORIGIN);
  fs.mkdirSync(path.dirname(LIVE), { recursive: true });
  g(TMP, "clone", "-q", ORIGIN, LIVE);
  fs.writeFileSync(path.join(LIVE, "README.md"), "demo\n"); g(LIVE, "add", "README.md"); g(LIVE, "commit", "-qm", "init"); g(LIVE, "push", "-q", "origin", "main");
  g(LIVE, "remote", "set-head", "origin", "main");
});
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// A fresh worktree on its own chatgpt/ branch, as prepareRepo() makes it.
function worktree() {
  const id = String(7000000 + ++n), wt = path.join(TMP, "exec", id, "demo"), branch = "chatgpt/" + id + "-x";
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  g(LIVE, "worktree", "add", "-q", "-b", branch, wt, "main");
  const [gitDir, commonDir] = g(wt, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir").split("\n");
  return { cwd: wt, branch, base: g(wt, "rev-parse", "HEAD"), gitDir, commonDir };
}
// The chain the model can build from inside its sandbox (all of it is in its own folder), then commit as a gitlink.
function chain(wt, variant, mark) {
  const fsm = path.join(wt, "fsm-" + variant + ".sh");
  fs.writeFileSync(fsm, "#!/bin/sh\necho \"fsmonitor ran: $0\" >> '" + mark + "'\nexit 1\n", { mode: 0o755 });
  const nested = path.join(wt, "nested-" + variant);
  let config;
  if (variant === "sepdir") {
    g(wt, "init", "-q", "--separate-git-dir", path.join(wt, "sep-gitdir"), nested);
    config = path.join(wt, "sep-gitdir", "config");
  } else {   // a hand-made git folder and a .git file pointing at it
    const gd = path.join(wt, "evil-gitdir");
    for (const d of ["objects", "refs/heads", "refs/tags"]) fs.mkdirSync(path.join(gd, d), { recursive: true });
    fs.writeFileSync(path.join(gd, "HEAD"), "ref: refs/heads/main\n");
    config = path.join(gd, "config");
    fs.writeFileSync(config, "[core]\n\trepositoryformatversion = 0\n\tbare = false\n");
    fs.mkdirSync(nested); fs.writeFileSync(path.join(nested, ".git"), "gitdir: ../evil-gitdir\n");
  }
  fs.writeFileSync(path.join(nested, "f.txt"), "n\n"); g(nested, "add", "f.txt"); g(nested, "commit", "-qm", "nested");
  g(wt, "add", path.basename(nested)); g(wt, "commit", "-qm", "add " + variant);
  assert.match(g(wt, "ls-tree", "HEAD", path.basename(nested)), /^160000 commit /, "the chain is committed as a gitlink");
  fs.appendFileSync(config, "\tfsmonitor = " + fsm + "\n");   // last, so the model's own commit does not trigger it
}
const ran = (mark) => fs.existsSync(mark);

test("every bridge git call carries the hardening flags and a minimal environment", async () => {
  const repo = worktree();
  process.env.SA5T225_SECRET_SENTINEL = "x"; process.env.GIT_DIR = "/nonexistent";   // set in the bridge's environment: not passed on
  try {
    for (const [k, v] of [["core.fsmonitor", "false"], ["core.hooksPath", "/dev/null"], ["protocol.file.allow", "never"], ["submodule.recurse", "false"]]) {
      const r = await executor.git(["config", "--get", k], repo.cwd);
      assert.equal(r.out, v, k);
    }
    const env = executor.gitEnv(repo.cwd);
    assert.equal(env.GIT_CONFIG_NOSYSTEM, "1"); assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null"); assert.equal(env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(env.GIT_CEILING_DIRECTORIES, path.dirname(repo.cwd));
    assert.ok(!("SA5T225_SECRET_SENTINEL" in env) && !("GIT_DIR" in env), "nothing else is inherited");
    const scopes = (await executor.git(["config", "--list", "--show-scope"], repo.cwd)).out.split("\n").map((l) => l.split("\t")[0]);
    assert.ok(!scopes.includes("global") && !scopes.includes("system"), "no global or system config: " + [...new Set(scopes)].join(","));
  } finally { delete process.env.SA5T225_SECRET_SENTINEL; delete process.env.GIT_DIR; }
});

for (const variant of ["sepdir", "gitfile"]) {
  test("nested repository (" + variant + ") with core.fsmonitor: live with plain git status, never run by the bridge", async () => {
    const repo = worktree(), mark = path.join(TMP, "fsmonitor-" + variant + "-" + n + ".txt");
    chain(repo.cwd, variant, mark);
    g(repo.cwd, "status", "--porcelain");
    assert.ok(ran(mark), "control: plain `git status` in the worktree runs the nested repository's fsmonitor command");
    fs.unlinkSync(mark);
    const text = await executor.verify(repo.cwd, repo);
    assert.ok(!ran(mark), "verify() did not run it");
    assert.match(text, /REFUSED: the branch adds or changes a gitlink.*nested-/);
    for (const args of [["status", "--porcelain"], ["status", "--porcelain", "--ignore-submodules=all"], ["diff", "HEAD~1"], ["log", "-1", "-p"]]) {
      await executor.git(args, repo.cwd);
      assert.ok(!ran(mark), "hardened `git " + args.join(" ") + "` did not run it (core.fsmonitor=false reaches the nested git too)");
    }
    const p = await executor.pushBranch(repo);
    assert.ok(!p.ok && /refused: the branch adds or changes a gitlink/.test(p.err), JSON.stringify(p));
    assert.equal(g(ORIGIN, "branch", "--list", repo.branch), "", "nothing pushed");
  });
}

test("branchSafety: refuses gitlinks (committed or only staged), .gitmodules and .git paths; allows ordinary work and a gitlink's removal", async () => {
  let repo = worktree();
  fs.writeFileSync(path.join(repo.cwd, "ok.js"), "1\n"); g(repo.cwd, "add", "ok.js"); g(repo.cwd, "commit", "-qm", "ok");
  assert.deepEqual(await executor.branchSafety(repo), { ok: true, bad: [] });

  repo = worktree();
  fs.writeFileSync(path.join(repo.cwd, ".gitmodules"), "[submodule \"x\"]\n\tpath = x\n\turl = ./x\n"); g(repo.cwd, "add", ".gitmodules"); g(repo.cwd, "commit", "-qm", "m");
  assert.deepEqual((await executor.branchSafety(repo)).bad, [".gitmodules"]);

  repo = worktree();
  const sha = g(repo.cwd, "rev-parse", "HEAD");
  g(repo.cwd, "update-index", "--add", "--cacheinfo", "160000," + sha + ",staged-only");   // staged, never committed
  assert.deepEqual((await executor.branchSafety(repo)).bad, ["staged-only"]);

  repo = worktree();   // a tree with a ".GIT" folder, built with mktree (git add would refuse it) and committed on the branch
  const blob = g(repo.cwd, "hash-object", "-w", "README.md");
  const sub = execFileSync("git", ["mktree"], { cwd: repo.cwd, input: "100644 blob " + blob + "\tconfig\n", encoding: "utf8" }).trim();
  const top = execFileSync("git", ["mktree"], { cwd: repo.cwd, input: "040000 tree " + sub + "\t.GIT\n100644 blob " + blob + "\tREADME.md\n", encoding: "utf8" }).trim();
  const c = g(repo.cwd, "commit-tree", top, "-p", "HEAD", "-m", "dotgit"); g(repo.cwd, "update-ref", "refs/heads/" + repo.branch, c);   // the index cannot hold it
  assert.deepEqual((await executor.branchSafety(repo)).bad, [".GIT/config"]);

  repo = worktree();   // removing a gitlink that is already on the base is allowed
  g(repo.cwd, "update-index", "--add", "--cacheinfo", "160000," + sha + ",old-sub"); g(repo.cwd, "commit", "-qm", "with sub");
  repo.base = g(repo.cwd, "rev-parse", "HEAD");
  g(repo.cwd, "rm", "-q", "--cached", "old-sub"); g(repo.cwd, "commit", "-qm", "drop sub");
  assert.deepEqual(await executor.branchSafety(repo), { ok: true, bad: [] });

  assert.equal((await executor.branchSafety(Object.assign({}, repo, { base: "undefined" }))).ok, false, "no valid fork point: refused");
  for (const p of [".git", "a/.git/config", "a/.GIT/hooks/x", ".git./x", "a/.git /y", ".g\u200cit/x", "git~1/x", "sub/.gitmodules", ".GitModules"]) assert.ok(executor.isGitPath(p), p);
  for (const p of ["a.git", ".github/x", ".gitignore", ".gitattributes", "x/git/y", "dotgit"]) assert.ok(!executor.isGitPath(p), p);
});

test("a safe branch to a local-path origin is not pushed by default (protocol.file.allow=never)", async () => {
  const repo = worktree();
  fs.writeFileSync(path.join(repo.cwd, "ok.js"), "1\n"); g(repo.cwd, "add", "ok.js"); g(repo.cwd, "commit", "-qm", "ok");
  const p = await executor.pushBranch(repo);
  assert.ok(!p.ok && /transport 'file' not allowed/.test(p.err), JSON.stringify(p));
});

test("execute(): a run that commits the chain ends BLOCKED, unpushed, with no Zoho write and nothing run by the bridge", async () => {
  const mark = path.join(TMP, "fsmonitor-execute.txt");
  const posts = [], updates = [];
  const e = { from: "chatgpt", correlation_id: "cgpt-nested", payload: { kind: "delegated_task", project_id: "1000001", task_id: "8000008", instruction: "do it", repo: "demo" } };
  await executor.execute(e, executor.delegation(e), { post: async (type, text) => { posts.push({ type, text }); return { status: 201 }; },
    claudeBin: "unused", childEnv: process.env,
    check: async () => ({ ok: true, open: true, name: "Nested", status: "Open", project_name: "P", description: "d" }),
    update: async (...a) => { updates.push(a); return { ok: true, fields_written: [] }; },
    run: async (bin, text, cwd) => { chain(cwd, "sepdir", mark); return { ok: true, text: "done\nSTATUS: COMPLETE" }; } });
  const res = posts.at(-1);
  assert.ok(!ran(mark), "the bridge never ran the fsmonitor command");
  assert.match(res.text, /REFUSED: the branch adds or changes a gitlink/);
  assert.match(res.text, /STATUS: BLOCKED: the bridge refused the branch/);
  assert.doesNotMatch(res.text, /STATUS: COMPLETE/);
  assert.equal(updates.length, 0, "no Zoho write-back for a refused branch");
  assert.equal(g(ORIGIN, "for-each-ref", "refs/heads/chatgpt"), "", "nothing pushed");
});
