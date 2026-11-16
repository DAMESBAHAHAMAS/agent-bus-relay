// Regression tests for P-A2 revision 4 (SA5-T225): the source repository's .git under the CLI sandbox.
// The real-CLI negative test of revision 3 found sandboxed code writing <src>/.git/refs/heads/chatgpt/<task>-<slug>: Claude Code
// adds a linked worktree's common git folder to the sandbox write roots by itself, and a write-deny entry is the only thing that
// wins over that. These tests evaluate the effective write lists the way the sandbox does (allow roots, including that CLI grant;
// deny entries win; glob entries converted like the CLI does; case-insensitive and Unicode case-folded matching), and, on macOS,
// check the same lists in the real OS sandbox (sandbox-exec) with real git on throwaway repositories. No Claude run, no network.
// Run: node --test chatgpt/test/exec-rev4-gitdir.test.js
const { test, before, after: afterAll } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exec-rev4-")));
process.env.BUS_EXEC_ROOT = path.join(TMP, "exec");
process.env.BUS_DEV_ROOT = path.join(TMP, "Developer");
process.env.BUS_DELEGATION_SWITCH = path.join(TMP, "delegation.on");
process.env.BUS_GIT_FILE_PROTOCOL = "always";
const executor = require("../executor");
const ID_ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: Object.assign({}, process.env, ID_ENV) }).trim();
before(() => fs.writeFileSync(process.env.BUS_DELEGATION_SWITCH, "on"));
afterAll(() => { if (!process.env.KEEP_TMP) fs.rmSync(TMP, { recursive: true, force: true }); else console.log("kept", TMP); });

function source(name) {
  const origin = path.join(TMP, name + ".git"); g(TMP, "init", "-q", "--bare", "-b", "main", origin);
  const live = path.join(TMP, "Developer", name);
  fs.mkdirSync(path.dirname(live), { recursive: true });
  g(TMP, "clone", "-q", origin, live); fs.writeFileSync(path.join(live, "r.txt"), "r\n"); g(live, "add", "r.txt"); g(live, "commit", "-qm", "r");
  g(live, "push", "-q", "origin", "HEAD:main"); g(live, "remote", "set-head", "origin", "main");
  g(live, "tag", "v1"); g(live, "pack-refs", "--all");   // a packed-refs file, as in a real checkout
  return { live, origin };
}
async function run(name, taskId) {
  const { live, origin } = source(name);
  g(live, "branch", "chatgpt/" + taskId + "-x", "main");   // an existing task branch: only the bridge may move it
  const r = executor.newRun(taskId);
  const repo = await executor.prepareRepo({ repo: name, task_id: taskId }, { name: "x" }, r);
  assert.ok(repo.ok, repo.reason);
  const s = JSON.parse(executor.execSettings(repo.cwd, repo));
  return { live, origin, repo, run: r, f: s.sandbox.filesystem, s };
}

// ---------- the sandbox's evaluation, as the CLI builds it (2.1.319) ----------
// Glob to regex like the CLI: text escaped, "*" = [^/]*, "?" = [^/], "[set]" = the set with .^$+{}()|\ escaped; a deny entry
// matches the path and everything below it. Used as is for the sandbox-exec profile below.
function globRegex(glob) {
  let out = "", i = 0;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") { let j = i; while (glob[j] === "*") j++; out += j - i >= 2 ? ".*" : "[^/]*"; i = j; }
    else if (c === "?") { out += "[^/]"; i++; }
    else if (c === "[" && glob.indexOf("]", i + 1) > 0) { const k = glob.indexOf("]", i + 1); out += "[" + glob.slice(i + 1, k).replace(/[.^$+{}()|\\]/g, "\\$&") + "]"; i = k + 1; }
    else { out += esc(c); i++; }
  }
  return "^" + out + "(/.*)?$";
}
// How the macOS sandbox evaluates that regex (checked with sandbox-exec on this Mac): the path is compared after Unicode case
// folding and lower-casing, and each set's letters, range ends included, are lower-cased ([L-j] means j..l). Modelled here by
// folding the path (NFKD + lower case) and turning each set into the explicit characters it then matches.
const foldPath = (p) => p.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function sandboxRegex(glob) {
  let out = "", i = 0;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&");
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") { out += "[^/]*"; i++; }
    else if (c === "[" && glob.indexOf("]", i + 1) > 0) {
      const k = glob.indexOf("]", i + 1), body = glob.slice(i + 1, k), chars = new Set();
      for (let x = 0; x < body.length; x++) {
        const a = body[x].toLowerCase();
        if (body[x + 1] === "-" && x + 2 < body.length) { const b = body[x + 2].toLowerCase(); const lo = Math.min(a.charCodeAt(0), b.charCodeAt(0)), hi = Math.max(a.charCodeAt(0), b.charCodeAt(0)); for (let q = lo; q <= hi; q++) chars.add(String.fromCharCode(q)); x += 2; }
        else chars.add(a);
      }
      out += "[" + [...chars].map(esc).join("") + "]"; i = k + 1;
    } else { out += esc(c.toLowerCase()); i++; }
  }
  return new RegExp("^" + out + "(/.*)?$");
}
const isGlob = (p) => /[*?[\]]/.test(p);
const under = (p, root) => foldPath(p) === foldPath(root) || foldPath(p).startsWith(foldPath(root).replace(/\/$/, "") + "/");
function evaluator(f, repo) {
  const roots = f.allowWrite.concat([repo.cwd, repo.commonDir]);   // the CLI adds the worktree's common git folder by itself
  const denies = f.denyWrite.map((d) => isGlob(d) ? { re: sandboxRegex(d) } : { lit: d });
  const denied = (p) => denies.some((d) => d.re ? d.re.test(foldPath(p)) : under(p, d.lit));
  return { writable: (p) => roots.some((r) => under(p, r)) && !denied(p), denied };
}

test("rev4: the effective lists deny the task branch, every other ref, packed-refs, HEAD, config and the shared objects, and keep the run's own paths writable", async () => {
  const { live, repo, f } = await run("r4a", "8400001");
  const C = repo.commonDir, ev = evaluator(f, repo);
  const ref = path.join(C, "refs", "heads", ...repo.runRef.split("/")), T = path.dirname(ref), N = path.basename(repo.gitDir);
  const runId = path.basename(ref);
  const deniedPaths = [
    path.join(C, "refs", "heads", "chatgpt", "8400001-x"), path.join(C, "refs", "heads", "chatgpt", "8400001-x.lock"), path.join(C, "refs", "heads", "chatgpt", "other"),
    path.join(C, "refs", "heads", "main"), path.join(C, "refs", "heads", "main.lock"), path.join(C, "refs", "heads", "new-branch"), path.join(C, "refs", "heads", "x", "y"),
    path.join(C, "refs", "tags", "v1"), path.join(C, "refs", "remotes", "origin", "main"), path.join(C, "refs", "stash"), path.join(C, "refs", "notes", "commits"),
    path.join(C, "refs", "heads", "chatgpt-run", "8400001", runId.slice(0, -1) + "0"), path.join(C, "refs", "heads", "chatgpt-run", "8400001", "other"),
    path.join(C, "refs", "heads", "chatgpt-run", "8400002", runId), path.join(C, "refs", "heads", "chatgpt-run", "x"),
    ref + "x", ref + ".lockx", ref + ".lck", path.join(T, runId.slice(0, 10)),
    path.join(C, "packed-refs"), path.join(C, "packed-refs.lock"), path.join(C, "objects", "ab", "c".repeat(38)), path.join(C, "objects", "pack", "p.pack"),
    path.join(C, "objects", "info", "alternates"), path.join(C, "objects", "info", "commit-graph"), path.join(C, "objects"),
    path.join(C, "HEAD"), path.join(C, "HEAD.lock"), path.join(C, "config"), path.join(C, "config.lock"), path.join(C, "hooks", "pre-commit"), path.join(C, "index"),
    path.join(C, "shallow"), path.join(C, "commondir"), path.join(C, "info", "exclude"), path.join(C, "FETCH_HEAD"), path.join(C, "ORIG_HEAD"), path.join(C, "modules", "m", "config"),
    path.join(C, "logs", "HEAD"), path.join(C, "logs", "refs", "heads", "main"), path.join(C, "logs", "refs", "heads", "chatgpt", "8400001-x"),
    path.join(C, "logs", "refs", "heads", "chatgpt-run", "8400001", "other"), path.join(C, "logs", "refs", "heads", "chatgpt-run", "8400001", runId + ".lock"),
    path.join(C, "worktrees", "other", "HEAD"), path.join(C, "worktrees", N + "x", "HEAD"), path.join(C, "worktrees", N.slice(0, -1)),
    path.join(repo.gitDir, "HEAD"), path.join(repo.gitDir, "config"), path.join(repo.gitDir, "config.worktree"), path.join(repo.gitDir, "commondir"), path.join(repo.gitDir, "gitdir"),
    path.join(repo.gitDir, "refs", "bisect", "x"), path.join(repo.gitDir, "hooks", "x"), path.join(repo.cwd, ".git"), executor.MARKER,
    // spelling variants: the sandbox compares case-insensitively and after Unicode case folding
    path.join(C, "REFS", "heads", "main"), path.join(C, "refs", "HEADS", "chatgpt", "8400001-X"), path.join(C, "Packed-Refs"), path.join(C, "OBJECTS", "ab", "cd"),
    path.join(C, "refs", "heads", "CHATGPT-RUN", "8400001", "other"), path.join(C, "refſ", "heads", "main"), path.join(C, "ſhallow"), path.join(C, "pacKed-refs"),
    // the ~/Developer spelling of the same folder
    path.join(live, ".git", "refs", "heads", "chatgpt", "8400001-x"), path.join(live, ".git", "packed-refs")];
  for (const p of deniedPaths) assert.ok(!ev.writable(p), "writable: " + p);
  const writablePaths = [ref, ref + ".lock", path.join(C, "logs", "refs", "heads", ...repo.runRef.split("/")),
    path.join(repo.gitDir, "index"), path.join(repo.gitDir, "index.lock"), path.join(repo.gitDir, "COMMIT_EDITMSG"), path.join(repo.gitDir, "ORIG_HEAD"),
    path.join(repo.gitDir, "logs", "HEAD"), path.join(repo.objects, "ab", "c".repeat(38)), path.join(repo.cwd, "src", "a.js")];
  for (const p of writablePaths) assert.ok(ev.writable(p), "not writable: " + p);
});

test("rev4: at every folder on the way to the run's paths, every printable-ASCII name except the next allowed part is denied (and its spelling variants)", async () => {
  const { repo, f } = await run("r4b", "8400002");
  const ev = evaluator(f, repo), tree = executor.gitAllowTree(repo);
  let rnd = 12345; const rand = (n) => (rnd = (rnd * 1103515245 + 12345) % 2147483648) % n;
  const ascii = []; for (let c = 0x20; c <= 0x7e; c++) if (c !== 0x2f) ascii.push(String.fromCharCode(c));
  let checked = 0;
  const walk = (dir, t) => {
    const allowed = Object.keys(t);
    const cands = new Set();
    for (const a of allowed) {
      for (let i = 0; i <= a.length; i++) for (const c of ascii) cands.add(a.slice(0, i) + c + (rand(2) ? "" : "zz"));   // every next character at every prefix
      for (let i = 1; i < a.length; i++) cands.add(a.slice(0, i));                                                    // proper prefixes
      cands.add(a.toUpperCase());
    }
    for (let k = 0; k < 400; k++) { let n = ""; const L = 1 + rand(12); for (let i = 0; i < L; i++) n += ascii[rand(ascii.length)]; cands.add(n); }
    for (const n of cands) {
      if (n === "." || n === ".." || allowed.includes(n)) continue;
      if (allowed.some((a) => a.toLowerCase() === n.toLowerCase())) continue;   // another spelling of the allowed folder itself
      assert.ok(!ev.writable(path.join(dir, n)), "writable: " + path.join(dir, n)); checked++;
      assert.ok(!ev.writable(path.join(dir, n, "deeper")), "writable: " + path.join(dir, n, "deeper"));
    }
    for (const [k, sub] of Object.entries(t)) if (Object.keys(sub).length) walk(path.join(dir, k), sub);
  };
  walk(repo.commonDir, tree);
  assert.ok(checked > 5000, "checked " + checked);
  assert.deepEqual(executor.gitWayDirs(repo).map((d) => path.relative(repo.commonDir, d)),
    ["", "worktrees", "refs", "refs/heads", "refs/heads/chatgpt-run", "refs/heads/chatgpt-run/8400002", "logs", "logs/refs", "logs/refs/heads", "logs/refs/heads/chatgpt-run", "logs/refs/heads/chatgpt-run/8400002"]);
});

test("rev4: denyOthers spells each rule in printable ASCII with set ends the CLI never escapes", () => {
  const rules = executor.denyOthers("/A/.git", ["refs", "logs", "worktrees", "Mixed_Case.Name-1"]);
  for (const r of rules) {
    assert.match(r, /^[\x20-\x7e]+$/, r);
    const sets = r.match(/\[[^\]]*\]/g) || [];
    assert.ok(sets.length <= 1, r);
    for (const s of sets) {
      const body = s.slice(1, -1);
      for (const m of body.matchAll(/(.)-(.)/g)) assert.match(m[1] + m[2], /^[a-z0-9 !#%&',:;<=>@_`~*?]{2}$/, "range end in " + r);   // never a capital: the sandbox lower-cases range ends
      assert.ok(!/[A-Z]/.test(body), "a capital letter in a set: " + r);
      assert.ok(!body.includes('"') && !body.startsWith("^"), r);
    }
  }
  assert.throws(() => executor.denyOthers("/A/.git", ["bad name"]), /not a plain/);
  assert.throws(() => executor.denyOthers("/A/[x]/.git", ["refs"]), /not a plain/);
});

// ---------- the same lists in the real macOS sandbox ----------
const SBX = process.platform === "darwin" && spawnSync("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]).status === 0;
function profile(f, repo) {
  const q = JSON.stringify;
  // As the CLI: the write roots plus the worktree's common git folder, and the device files every command may write.
  const devs = ["/dev/stdout", "/dev/stderr", "/dev/null", "/dev/tty", "/dev/dtracehelper"].map((p) => "(literal " + q(p) + ")");
  const allow = f.allowWrite.concat([repo.cwd, repo.commonDir]).map((p) => "(subpath " + q(p) + ")").concat(devs);
  const deny = f.denyWrite.map((d) => isGlob(d) ? "(regex " + q(globRegex(d)) + ")" : "(subpath " + q(d) + ")");
  return "(version 1)(allow default)(deny file-write*)(allow file-write* " + allow.join(" ") + ")(deny file-write* " + deny.join(" ") + ")";
}
const runEnv = (repo) => Object.assign({}, process.env, ID_ENV, { GIT_OBJECT_DIRECTORY: repo.objects, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repo.commonDir, "objects"),
  GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "gc.auto", GIT_CONFIG_VALUE_0: "0", GIT_CONFIG_KEY_1: "maintenance.auto", GIT_CONFIG_VALUE_1: "false", GIT_CONFIG_KEY_2: "core.fsmonitor", GIT_CONFIG_VALUE_2: "false" });
const inSandbox = (prof, cwd, env, cmd, ...args) => spawnSync("/usr/bin/sandbox-exec", ["-p", prof, cmd, ...args], { cwd, env, encoding: "utf8" });
const tryWrite = (prof, cwd, p) => inSandbox(prof, cwd, process.env, process.execPath, "-e",
  "const fs=require('fs'),path=require('path');const p=process.argv[1];try{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'x\\n');console.log('WROTE')}catch(e){console.log(e.code)}", p).stdout.trim();

test("rev4 (macOS sandbox): with these lists a commit on the run branch works and the task branch, other refs, packed-refs and shared objects stay unwritten", { skip: !SBX && "sandbox-exec not available" }, async () => {
  const { live, repo, f } = await run("r4c", "8400003");
  const C = repo.commonDir, prof = profile(f, repo);
  const snapshot = () => g(live, "for-each-ref", "--format=%(refname) %(objectname)") + "\n" + fs.readFileSync(path.join(C, "packed-refs"), "utf8");
  const before0 = snapshot(), objsBefore = g(live, "count-objects", "-v");
  fs.writeFileSync(path.join(repo.cwd, "a.txt"), "a\n");
  let r = inSandbox(prof, repo.cwd, runEnv(repo), "git", "add", "a.txt");
  assert.equal(r.status, 0, "git add: " + r.stderr);
  r = inSandbox(prof, repo.cwd, runEnv(repo), "git", "commit", "-qm", "rev4 positive control");
  assert.equal(r.status, 0, "git commit on the run branch: " + r.stderr);
  const tip = fs.readFileSync(path.join(C, "refs", "heads", ...repo.runRef.split("/")), "utf8").trim();
  assert.match(tip, /^[0-9a-f]{40}$/);
  assert.ok(fs.readdirSync(repo.objects).some((d) => /^[0-9a-f]{2}$/.test(d)), "the commit's objects are in the run's own object folder");
  for (const p of [path.join(C, "refs", "heads", "chatgpt", "8400003-x"), path.join(C, "refs", "heads", "main"), path.join(C, "refs", "heads", "brand-new"),
    path.join(C, "refs", "tags", "v2"), path.join(C, "packed-refs"), path.join(C, "objects", "ab", "c".repeat(38)), path.join(C, "HEAD"), path.join(C, "config"),
    path.join(C, "REFS", "heads", "main"), path.join(C, "refs", "heads", "CHATGPT", "8400003-x"), path.join(C, "refſ", "heads", "main"), path.join(C, "ſhallow"),
    path.join(C, "logs", "HEAD"), path.join(C, "worktrees", "other", "HEAD"), path.join(repo.gitDir, "HEAD"), path.join(live, ".git", "refs", "heads", "chatgpt", "8400003-x")])
    assert.equal(tryWrite(prof, repo.cwd, p), "EPERM", "sandboxed write not refused: " + p);
  r = inSandbox(prof, repo.cwd, runEnv(repo), "git", "update-ref", "refs/heads/chatgpt/8400003-x", tip);
  assert.notEqual(r.status, 0, "git update-ref of the task branch was allowed");
  r = inSandbox(prof, repo.cwd, runEnv(repo), "git", "pack-refs", "--all");
  assert.notEqual(r.status, 0, "git pack-refs was allowed");
  assert.equal(snapshot().replace(/^refs\/heads\/chatgpt-run\/.*\n/m, ""), before0.replace(/^refs\/heads\/chatgpt-run\/.*\n/m, ""), "a ref or packed-refs changed");
  assert.equal(g(live, "count-objects", "-v"), objsBefore, "the shared object store changed");
  assert.equal(g(live, "rev-parse", "refs/heads/chatgpt/8400003-x"), g(live, "rev-parse", "main"), "the task branch moved");
  // The model of the sandbox used by the tests above agrees with the real sandbox on near-miss names at every folder on the way.
  const ev = evaluator(f, repo), tree = executor.gitAllowTree(repo);
  let rnd = 777; const rand = (n) => (rnd = (rnd * 1103515245 + 12345) % 2147483648) % n;
  const ascii = []; for (let c = 0x21; c <= 0x7e; c++) if (c !== 0x2f) ascii.push(String.fromCharCode(c));
  let n = 0;
  const walk = (dir, t) => {
    for (const a of Object.keys(t)) for (let k = 0; k < 12; k++) {
      const i = rand(a.length + 1), c = ascii[rand(ascii.length)];
      const name = k % 3 === 0 ? a.slice(0, i) + c + a.slice(i) : k % 3 === 1 ? a.slice(0, i) + c : a.slice(0, Math.max(1, i)) + "\u017f".repeat(k % 2);
      if (name.toLowerCase() === a.toLowerCase() || name === "." || name === "..") continue;
      const p = path.join(dir, name, "probe");
      assert.equal(tryWrite(prof, repo.cwd, p) === "WROTE", ev.writable(p), "the model and the sandbox disagree on " + p); n++;
    }
    for (const [k, sub] of Object.entries(t)) if (Object.keys(sub).length) walk(path.join(dir, k), sub);
  };
  walk(C, tree);
  for (const p of [path.join(repo.gitDir, "probe-index"), path.join(repo.objects, "ab", "probe"), path.join(C, "logs", "refs", "heads", ...repo.runRef.split("/"))])
    assert.equal(tryWrite(prof, repo.cwd, p), "WROTE", "the run cannot write its own path " + p);
  assert.ok(n > 100, "compared " + n);
});

test("rev4: a name the sandbox rules cannot cover (non-ASCII after an allowed prefix) refuses the branch; nothing is pushed", async () => {
  const { origin, live } = source("r4d");
  const posts = [];
  const e = { from: "chatgpt", correlation_id: "cgpt-r4d", payload: { kind: "delegated_task", project_id: "1000001", task_id: "8400004", instruction: "do it", repo: "r4d" } };
  await executor.execute(e, executor.delegation(e), { post: async (type, text) => { posts.push({ type, text }); return { status: 201 }; }, claudeBin: "unused", childEnv: process.env,
    check: async () => ({ ok: true, open: true, name: "x", status: "Open", project_name: "P", description: "d" }), update: async () => ({ ok: true, fields_written: [] }),
    run: async (bin, text, cwd, env, repo) => {
      fs.writeFileSync(path.join(cwd, "a.txt"), "a\n"); execFileSync("git", ["add", "a.txt"], { cwd, env: Object.assign({}, env, ID_ENV) }); execFileSync("git", ["commit", "-qm", "a"], { cwd, env: Object.assign({}, env, ID_ENV) });
      fs.writeFileSync(path.join(repo.commonDir, "refs", "heads", "中x"), "0".repeat(40) + "\n");   // what the sandbox rules leave open
      return { ok: true, text: "done\nSTATUS: COMPLETE" };
    } });
  const last = posts[posts.length - 1].text;
  assert.match(last, /STATUS: BLOCKED: the bridge refused the branch: it comes from a run that created "refs\/heads\/中x" in the source repository's git folder/);
  assert.equal(g(origin, "for-each-ref", "--format=%(refname)", "refs/heads/chatgpt/"), "", "pushed");
  assert.ok(fs.existsSync(path.join(live, ".git", "refs", "heads", "中x")), "the bridge does not delete what it found; it refuses and reports it");
});

test("rev4: prepareRepo refuses a repository path the sandbox rules cannot spell", async () => {
  source("odd[1]");   // delegation() never accepts this name; prepareRepo still refuses it on its own
  const r = executor.newRun("8400005");
  const bad = await executor.prepareRepo({ repo: "odd[1]", task_id: "8400005" }, { name: "x" }, r);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /sandbox write rules cannot spell/);
  assert.ok(!fs.readdirSync(path.join(TMP, "Developer", "odd[1]", ".git", "worktrees")).length, "the refused run's worktree is detached");
});
