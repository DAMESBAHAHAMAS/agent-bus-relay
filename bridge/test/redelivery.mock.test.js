const http=require("http");const sleep=(ms)=>new Promise(r=>setTimeout(r,ms/200));const logs=[];const log=(...a)=>logs.push(a.join(" "));
const keepWithheld=()=>"/tmp/kept.txt";let state={};const done=new Set();const save=()=>{};const k="claude-code|m1";
const splitReply=(t,limit,m)=>{const o=[];let r=t;while(r){let n=Math.min(r.length,limit-20);o.push(r.slice(0,n));r=r.slice(n)}return o};
let mode="recover",posts=[];
const srv=http.createServer((q,s)=>{let b="";q.on("data",d=>b+=d);q.on("end",()=>{const j=JSON.parse(b);posts.push(j.type+":"+j.payload.slice(0,14));
 const full=/(^|\n)\s*curl /.test(j.payload)||(!j.payload.startsWith("Received")&&j.type!=="alert"&&!j.payload.startsWith("[resend"));
 const resend=j.payload.startsWith("[resend");
 if(full||(mode==="stuck"&&resend&&false)){s.writeHead(403,{"content-type":"text/html",server:"cloudflare","cf-ray":"r1-MIA"});return s.end("<html>Blocked</html>")}
 s.writeHead(201,{"content-type":"application/json"});s.end("{}")})});
async function api(key, method, pathAndQuery, body, timeoutMs) {
  const r = await fetch(global.BASE + pathAndQuery, { method, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 40000) });
  // Keep the raw body: a non-JSON answer (an edge or proxy block, not a relay rule) used to be logged as "{}", hiding the cause.
  let j = {}, raw = "";
  try { raw = await r.text(); j = JSON.parse(raw); } catch (e) {}
  const h = (n) => r.headers.get(n) || "";
  return { status: r.status, json: j, raw, hdr: { server: h("server"), ctype: h("content-type"), cfray: h("cf-ray"), renderRouting: h("rndr-id") } };
}

// Post a reply with its own retry. A failed post must not cost a second wake of the whole task. Retries only what can be transient:
// a network error, 429, 5xx, or a 403 whose body is not the relay's JSON (the relay always refuses in JSON, so that one came from the edge).
// A JSON refusal or a 422 is the relay's real answer and is returned at once. Waits 2 s, 6 s, then 15 s.
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
async function run(){ const agent="claude-code",cid="c1",key="k",env={from:"chatgpt"},result={text:"intro\n```\ncurl -s -A \"Mozilla/5.0\" https://x.test/ | grep -oE a\n```\n"+"A".repeat(1500)};
const type=global.type; const parts = splitReply(result.text, 3450, (s) => JSON.stringify(s).length);
    let posted = 0, kept = false, fallbackFrom = -1, fallbackAcked = false;
    for (let i = 0; i < parts.length; i++) {
      const which = parts.length > 1 ? "Part " + (i + 1) + " of " + parts.length + " of my reply" : "My full reply";
      let r = await postWithRetry(agent, cid, key, { to: env.from, type, correlation_id: cid, payload: parts[i] });
      if (r.status === 422) { // the agent did reply, but the relay withheld the content
        if (!kept) { kept = true; log(agent, "reply for", cid, "withheld by the relay; kept at", keepWithheld(agent, cid, result.text, r.json.detail)); }
        r = await postWithRetry(agent, cid, key, { to: env.from, type: "ack", correlation_id: cid, payload: "Received. " + which + " was withheld by the relay: " + String(r.json.detail || "sensitive content") });
      }
      // Fallback: Cloudflare (not the relay) keeps blocking this reply. Keep the full text locally and acknowledge with a short plain
      // message so the request is still answered within the window. The relay's own rules are untouched.
      if (r.status === 403 && /cloudflare/i.test((r.hdr && r.hdr.server) || "") && !(r.json && Object.keys(r.json).length)) {
        if (!kept) { kept = true; log(agent, "reply for", cid, "blocked by Cloudflare; kept at", keepWithheld(agent, cid, result.text, "cloudflare ray " + (r.hdr.cfray || "?"))); }
        const ray = (r.hdr.cfray || "unknown").replace(/[^\w-]/g, "");
        r = await postWithRetry(agent, cid, key, { to: env.from, type: "ack", correlation_id: cid,
          payload: "Received. " + agent + " finished the task, but my full reply was blocked on its way to the relay by a Cloudflare Blocked page (ray " + ray + ", " + new Date().toISOString().slice(0, 19) + "Z). It is saved on the Mac bridge and not lost. Ask me to resend it in shorter parts." });
        if (r.status === 201) { fallbackAcked = true; fallbackFrom = i; log(agent, "sent the short fallback acknowledgment for", cid, "(acknowledged only, NOT complete)"); }
      }
      if (r.status === 201) posted++;
      else log(agent, "could not post", which.toLowerCase(), "for", cid, "HTTP", r.status, JSON.stringify(r.json).slice(0, 160), "raw body:", JSON.stringify(String(r.raw || "").slice(0, 300)), "headers:", JSON.stringify(r.hdr || {}));
      if (fallbackAcked) break; // the rest is redelivered below in smaller parts
      if (i < parts.length - 1) await sleep(500);
    }
    // A fallback acknowledgment is NOT completion. Resend everything not yet delivered in small plain parts, retrying the failed ones.
    let incomplete = 0;
    if (fallbackAcked) {
      // Cloudflare blocked a literal curl/wget command line in a probe (11 Nov 2026). Describe such lines in words for the resend only;
      // the first attempt and the saved original in the withheld folder are unchanged.
      const describeCmd = (t) => t.split("\n").map((l) => /^\s*(\$\s*)?(curl|wget)\b/i.test(l) ? "[a " + (/wget/i.test(l) ? "wget" : "curl") + " command line was here; withheld because the edge blocks it. The full text is saved on the Mac bridge]" : l).join("\n");
      const rest = describeCmd(parts.slice(fallbackFrom).join("\n\n"));
      const small = splitReply(rest, 1200, (x) => JSON.stringify(x).length);
      const todo = small.map((t, n) => ({ n: n + 1, t }));
      for (const wait of [0, 20000, 60000]) {
        if (wait) await sleep(wait);
        for (const it of todo.filter((x) => !x.ok)) {
          const rr = await postWithRetry(agent, cid, key, { to: env.from, type, correlation_id: cid, payload: "[resend " + it.n + "/" + small.length + "] " + it.t });
          if (rr.status === 201) it.ok = true;
          else log(agent, "redelivery part", it.n + "/" + small.length, "for", cid, "HTTP", rr.status, "still undelivered");
          await sleep(700);
        }
        if (todo.every((x) => x.ok)) break;
      }
      incomplete = todo.filter((x) => !x.ok).length;
      if (incomplete) {
        state.incomplete = (state.incomplete || []).concat([{ agent, cid, undelivered: incomplete, of: small.length, at: new Date().toISOString() }]).slice(-50);
        log(agent, "INCOMPLETE delivery for", cid + ":", incomplete, "of", small.length, "parts undelivered; full reply kept in the withheld folder");
        await api(key, "POST", "/messages", { to: env.from, type: "alert", correlation_id: cid,
          payload: "DELIVERY INCOMPLETE: " + agent + " acknowledged " + cid + " but " + incomplete + " of " + small.length + " reply parts could not be delivered. The full reply is saved on the Mac bridge. This notice is from the bridge." }).catch(() => {});
      }
    }
    // Once any part is on the bus the request is acknowledged, so the task is not re-run. It is only COMPLETE when every part was delivered.
    if (posted) {
      done.add(k); save();
      if (fallbackAcked) { if (!incomplete) log(agent, "COMPLETE (after fallback and redelivery)", cid); }
      else log(agent, type === "result" ? "answered" : "acknowledged", cid, parts.length > 1 ? "in " + posted + "/" + parts.length + " parts" : "");
    }

}
srv.listen(0,async()=>{global.BASE="http://127.0.0.1:"+srv.address().port;const type="result";
 for(const m of ["recover","stuck"]){mode=m;posts=[];logs.length=0;global.type=type;await run();console.log("== "+m);console.log(posts.length+" posts; "+logs.filter(l=>/COMPLETE|INCOMPLETE|fallback|answered/.test(l)).map(l=>l.slice(0,95)).join(" | "));console.log("alert sent:",posts.some(p=>p.startsWith("alert")),"state.incomplete:",JSON.stringify(state.incomplete||[]).slice(0,60),"done:",done.has(k))}
 srv.close()});
