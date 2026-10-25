#!/usr/bin/env node
// Offline simulation of the relay's oc- channel reader (server.js ocPoll), used to test an OC_PRIORITY change
// before it is switched on Render. It runs the exact ocPoll source from server.js in a sandbox with a fake clock
// and a fake Cliq: no network, no credentials, nothing live is touched.
// Usage: node tests/oc-priority-sim.js [priority agent, default bizops] [minutes, default 10]
const fs = require("fs"), path = require("path"), vm = require("vm");
const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const grab = (re, name) => { const m = src.match(re); if (!m) throw new Error("could not find " + name + " in server.js"); return m[0]; };
const pollSrc = grab(/^async function ocPoll[\s\S]*?\n}\n/m, "ocPoll");
const priSrc = grab(/^const OC_PRIORITY = [^\n]+\nconst OC_PRIORITY_MS = [^\n]+\n/m, "OC_PRIORITY constants");
const pollMsSrc = grab(/^const OC_POLL_MS = [^\n]+\n/m, "OC_POLL_MS");

const PRIORITY = process.argv[2] || "bizops", MINUTES = Number(process.argv[3] || 10);
const AGENTS_LIST = ["bizops", "finance", "salesmkt", "systems", "compliance", "maryalice", "zia-projects"];
let clock = 1e12; const DAMIAN = "653988173";
const posted = {};                 // chat -> [{id,time,text}] messages Damian "typed"
const readLog = [];                // [time, agent]
const ctx = {
  console, JSON, Set, Map, Math, Number, String, Array, Object, Promise,
  Date: { now: () => clock },
  env: (k, d) => (k === "OC_PRIORITY" ? PRIORITY : d),
  OC: Object.fromEntries(AGENTS_LIST.map((a) => [a, "CT_" + a])),
  AGENTS: new Set(AGENTS_LIST), SIGNING: "x", READS_PER_MIN: 12, reads: [], ocState: new Map(), OC_HINT_MIN_MS: 3000,
  STARTED_AT: 0, waiters: new Map(),
  fromDamian: (m) => m.sender_id === DAMIAN, ocIsRelayPost: () => false, audit: () => {},
  cliq: async (method, p) => { const chat = decodeURIComponent(p.split("/")[2]); const a = Object.keys(ctx.OC).find((x) => ctx.OC[x] === chat);
    readLog.push([clock, a]); ctx.reads.push(clock);
    return { status: 200, json: { data: (posted[chat] || []).map((m) => ({ id: m.id, time: m.time, sender: { id: DAMIAN }, content: { text: m.text } })) } }; },
};
vm.createContext(ctx);
vm.runInContext(pollMsSrc.replace(/^const /, "var ") + priSrc.replace(/^const /gm, "var ") + pollSrc, ctx);

(async () => {
  // Damian posts in the priority channel at random times; also once in finance.
  const sends = [];
  for (let i = 0; i < 12; i++) sends.push({ agent: PRIORITY, at: clock + 15000 + i * 47000 + (i * 7919 % 9000) });
  sends.push({ agent: "finance", at: clock + 30000 });
  const seenAt = {};
  for (let t = 0; t < MINUTES * 6; t++) {               // the relay calls ocPoll() every 10 s (setInterval in server.js)
    clock += 10000;
    for (const s of sends) if (!s.posted && s.at <= clock) { s.posted = true; s.id = "m" + s.at; (posted[ctx.OC[s.agent]] = posted[ctx.OC[s.agent]] || []).push({ id: s.id, time: s.at, text: "hi" }); }
    await vm.runInContext("ocPoll()", ctx);
    for (const s of sends) if (s.posted && seenAt[s.id] === undefined && ((ctx.ocState.get(s.agent) || {}).inbox || []).some((m) => m.id === s.id)) seenAt[s.id] = clock - s.at;
  }
  const per = {}; for (const [, a] of readLog) per[a] = (per[a] || 0) + 1;
  const gaps = (a) => { const ts = readLog.filter((r) => r[1] === a).map((r) => r[0]); return ts.slice(1).map((t, i) => (t - ts[i]) / 1000); };
  const pr = sends.filter((s) => s.agent === PRIORITY).map((s) => seenAt[s.id] / 1000);
  const readsPerMin = readLog.length / MINUTES;
  const others = AGENTS_LIST.filter((a) => a !== PRIORITY).map((a) => Math.max(...gaps(a), 0));
  console.log(JSON.stringify({ priority: PRIORITY, minutes: MINUTES, oc_reads_per_min: +readsPerMin.toFixed(2), reads_per_channel: per,
    priority_pickup_seconds: { max: Math.max(...pr), mean: +(pr.reduce((x, y) => x + y, 0) / pr.length).toFixed(1), all: pr },
    finance_pickup_seconds: seenAt[sends[sends.length - 1].id] / 1000, worst_gap_other_channels_seconds: Math.max(...others) }, null, 1));
  const ok = Math.max(...pr) <= 20 && readsPerMin <= 6 && Math.max(...others) <= 180 && !pr.some(Number.isNaN);
  console.log(ok ? "PASS" : "FAIL"); process.exit(ok ? 0 : 1);
})();
