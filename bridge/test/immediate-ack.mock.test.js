
const http=require("http");const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));const logs=[];const log=(...a)=>logs.push(a.join(" "));
let posts=[],T0=0;const srv=http.createServer((q,s)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{const j=JSON.parse(b);posts.push({t:Date.now()-T0,type:j.type,p:j.payload.slice(0,18)});s.writeHead(201,{"content-type":"application/json"});s.end("{}")})});
const attempts=new Map();const k="a|m";const key="k";
async function api(key, method, pathAndQuery, body, timeoutMs) {
  const r = await fetch(global.BASE + pathAndQuery, { method, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 40000) });
  // Keep the raw body: a non-JSON answer (an edge or proxy block, not a relay rule) used to be logged as "{}", hiding the cause.
  let j = {}, raw = "";
  try { raw = await r.text(); j = JSON.parse(raw); } catch (e) {}
  const h = (n) => r.headers.get(n) || "";
  return { status: r.status, json: j, raw, hdr: { server: h("server"), ctype: h("content-type"), cfray: h("cf-ray"), renderRouting: h("rndr-id") } };
}
async function postWithRetry(agent, cid, key, body) {
  const waits = [2000, 6000, 15000];
  let r;
  for (let n = 0; n <= waits.length; n++) {
    try { r = await api(key, "POST", "/messages", body); }
    catch (e) { r = { status: 0, json: {}, raw: String(e && e.message || e).slice(0, 200), hdr: {} }; }
    const relayJson = r.json && typeof r.json === "object" && Object.keys(r.json).length > 0;
    const transient = r.status === 0 || r.status === 429 || r.status >= 500 || (r.status === 403 && !relayJson);
    const cfBlock = r.status === 403 && /cloudflare/i.test((r.hdr && r.hdr.server) || ""); // a content block does not clear in seconds: one retry, then the caller's fallback
    if (r.status === 201 || !transient || n === waits.length || (cfBlock && n >= 1)) break;
    log(agent, "reply post for", cid, "got HTTP", r.status, "(not a relay refusal); retry", n + 1, "of", waits.length, "in", waits[n] / 1000, "s. body:", JSON.stringify(String(r.raw || "").slice(0, 300)), "headers:", JSON.stringify(r.hdr));
    await sleep(waits[n]);
  }
  return r;
}

async function run(env,att,off){ global.IMM=!off; var IMMEDIATE_ACK=global.IMM; attempts.set(k,att); const agent="claude-code",cid="c1";
 const WAKE={x:async()=>{await sleep(3000);return{ok:true,text:"done"}}};const KINDS={"claude-code":"x"};const frame=()=>"";
    const ackSent = (IMMEDIATE_ACK && env.type === "request" && env.from !== "relay" && (attempts.get(k) || 0) === 1)
      ? postWithRetry(agent, cid, key, { to: env.from, type: "ack", correlation_id: cid,
          payload: "Received. " + agent + " is working on it now. The result follows as a separate message on this id." })
          .then((r) => { log(agent, r.status === 201 ? "immediate ack sent for" : "immediate ack FAILED (HTTP " + r.status + ") for", cid); return r.status === 201; })
          .catch(() => false)
      : Promise.resolve(false);
    const result = await WAKE[KINDS[agent]](agent, frame(agent, env), env);
    await ackSent;

 await ackSent; posts.push({t:Date.now()-T0,type:"RESULT-READY",p:""});}
srv.listen(0,async()=>{global.BASE="http://127.0.0.1:"+srv.address().port;
 for(const [name,env,att,off] of [["request first attempt",{type:"request",from:"chatgpt"},1,false],["alert (no ack)",{type:"alert",from:"claude-systems"},1,false],["retry attempt 2 (no ack)",{type:"request",from:"chatgpt"},2,false],["off switch",{type:"request",from:"chatgpt"},1,true]]){
  posts=[];T0=Date.now();await run(env,att,off);console.log(name.padEnd(26),posts.map(p=>p.type+"@"+p.t+"ms").join("  "))}
 srv.close()});
