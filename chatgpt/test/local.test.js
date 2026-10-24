// Offline proof of the ChatGPT connector: the REAL relay (server.js) runs against a mock Zoho/Cliq on localhost.
// No real credential, channel or agent is touched. Run: node --test chatgpt/test/
// The official MCP SDK client test runs when @modelcontextprotocol/sdk is found (MCP_SDK_DIR, or the copy under welcomeiq/).
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

const DAMIAN = "111", STRANGER = "999", CC_KEY = "test-key-claude-code", OPS_KEY = "test-key-ops";
const OAUTH_SECRET = crypto.randomBytes(32).toString("base64url");
const msgs = []; let seq = 0;
const chats = { CT_1: msgs, CT_AL: [] };   // #agent-bus and #oc-alerts (where refresh-token state markers live)
const mock = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/oauth/v2/token")) return j(200, { access_token: "mock", expires_in: 3600 });
    const chat = (req.url.match(/^\/chats\/([^/]+)\/message/) || [])[1];
    if (req.method === "GET" && chat) return j(200, { data: (chats[chat] || []).slice(-100).reverse() });
    if (req.method === "POST" && chat) { const id = String(++seq); (chats[chat] = chats[chat] || []).push({ id, time: Date.now(), sender: { id: DAMIAN }, content: { text: JSON.parse(body).text } }); return j(200, { message_id: id }); }
    if (req.method === "POST" && (/^\/channelsbyname\//.test(req.url))) {
      const id = String(++seq); msgs.push({ id, time: Date.now(), sender: { id: DAMIAN, name: "Damian" }, content: { text: JSON.parse(body).text } });
      return j(200, { message_id: id });
    }
    return j(200, { ok: true });
  });
});
const human = (sender, text) => msgs.push({ id: String(++seq), time: Date.now(), sender: { id: sender, name: "x" }, content: { text } });

const relays = [];
async function startRelay(extra) {
  const port = 18000 + Math.floor(Math.random() * 1000) + relays.length * 1000;
  const base = "http://127.0.0.1:" + port, M = "http://127.0.0.1:" + mock.address().port;
  const p = spawn(process.execPath, [path.join(__dirname, "../../server.js")], { stdio: "ignore", env: Object.assign({}, process.env, {
    PORT: String(port), ZOHO_ACCOUNTS_URL: M, CLIQ_API_BASE: M, CHANNEL_UNIQUE_NAME: "agentbus", CHANNEL_CHAT_ID: "CT_1",
    SERVICE_KEYS: "claude-code:" + CC_KEY + ",ops:" + OPS_KEY, ADMIN_AGENTS: "ops", EXTERNAL_AGENTS: "muse", DAMIAN_CLIQ_IDS: DAMIAN,
    BUS_SIGNING_SECRET: "test-signing-secret", POLL_MS: "5000", OUTSIDE_ROUTES: "muse>maryalice,chatgpt>claude-code",
    CHATGPT_MCP_ENABLED: "1", CHATGPT_OAUTH_SECRET: OAUTH_SECRET, OC_ALERTS_CHAT: "CT_AL", PUBLIC_BASE_URL: base }, extra) });
  relays.push(p);
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/healthz")).ok) return base; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); }
  throw Error("relay did not start");
}
let B;
before(async () => { await new Promise((r) => mock.listen(0, r)); B = await startRelay({}); });
after(() => { for (const p of relays) p.kill(); mock.close(); });

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
async function approveFromPage(base, authUrl, approver) {
  const html = await (await fetch(authUrl)).text();
  const code = html.match(/approve chatgpt ([A-Z0-9]{4}-[A-Z0-9]{4})/)[1];
  const id = html.match(/const id="([^"]+)"/)[1];
  assert.deepStrictEqual(await (await fetch(base + "/oauth/approval?id=" + id)).json(), { waiting: true });
  human(approver, "approve chatgpt " + code);
  let last;   // poll like the sign-in page does; the relay re-reads the channel at most every 10 seconds
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 2500)); last = await (await fetch(base + "/oauth/approval?id=" + id)).json(); if (!last.waiting) break; }
  return last;
}
async function startSignIn(base, extraQuery) {
  const reg = await (await fetch(base + "/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "ChatGPT" }) })).json();
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams(Object.assign({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st", resource: base + "/mcp", scope: "claude.ask" }, extraQuery));
  return { reg, verifier, url: base + "/oauth/authorize?" + q };
}
async function mcp(base, method, params, token, headers) {
  const r = await fetch(base + "/mcp", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, token ? { Authorization: "Bearer " + token } : {}, headers || {}),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
}
let access, session;

test("OpenAI checklist: resource and authorization server metadata", async () => {
  const prmRoot = await (await fetch(B + "/.well-known/oauth-protected-resource")).json();
  const prm = await (await fetch(B + "/.well-known/oauth-protected-resource/mcp")).json();
  const asm = await (await fetch(B + "/.well-known/oauth-authorization-server")).json();
  assert.deepStrictEqual(prmRoot, prm);
  assert.strictEqual(prm.resource, B + "/mcp");
  assert.strictEqual(prm.authorization_servers[0], asm.issuer, "issuer string identical in both documents");
  for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) assert.ok(asm[k].startsWith(asm.issuer + "/"), k);
  assert.ok(asm.code_challenge_methods_supported.includes("S256"));
  assert.deepStrictEqual(asm.token_endpoint_auth_methods_supported, ["none"]);
  assert.strictEqual(asm.authorization_response_iss_parameter_supported, true);
  assert.ok(!asm.scopes_supported.some((s) => ["openid", "email", "profile"].includes(s)), "no OIDC scopes advertised");
});
test("unauthenticated and forged requests get 401 with a resource_metadata challenge", async () => {
  const r = await mcp(B, "tools/list", {});
  assert.strictEqual(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /^Bearer resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.strictEqual((await mcp(B, "tools/list", {}, "cgpt.eyJrIjoiYWNjZXNzIn0.forged")).status, 401);
});
test("client registration refuses redirect addresses outside chatgpt.com", async () => {
  for (const u of ["https://evil.example/cb", "http://chatgpt.com/cb", "https://chatgpt.com:8443/cb", "https://chatgpt.com.evil.example/cb"])
    assert.strictEqual((await fetch(B + "/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [u] }) })).status, 400, u);
});
test("authorization errors redirect with iss equal to the issuer; wrong resource and missing PKCE are refused", async () => {
  const { url } = await startSignIn(B, { resource: "https://other.example/mcp" });
  const r = await fetch(url, { redirect: "manual" });
  const loc = new URL(r.headers.get("location"));
  assert.strictEqual(loc.searchParams.get("error"), "invalid_target"); assert.strictEqual(loc.searchParams.get("iss"), B);
  const p = await startSignIn(B, { code_challenge_method: "plain" });
  assert.strictEqual(new URL((await fetch(p.url, { redirect: "manual" })).headers.get("location")).searchParams.get("error"), "invalid_request");
});
test("Damian's approval counts when Cliq wraps it in a code block; a wrong code or another sender does not", async () => {
  const { url } = await startSignIn(B, {});
  const html = await (await fetch(url)).text();
  const code = html.match(/approve chatgpt ([A-Z0-9]{4}-[A-Z0-9]{4})/)[1], id = html.match(/const id="([^"]+)"/)[1];
  human(DAMIAN, "```approve chatgpt WRNG-CODE```");
  human(STRANGER, "```approve chatgpt " + code + "```");
  await new Promise((r) => setTimeout(r, 11000));
  assert.deepStrictEqual(await (await fetch(B + "/oauth/approval?id=" + id)).json(), { waiting: true }, "wrong code or wrong sender");
  human(DAMIAN, "```approve chatgpt " + code + "```");   // the exact form Cliq stored on 2026-10-18
  let a; for (let i = 0; i < 6 && !(a && a.redirect); i++) { await new Promise((r) => setTimeout(r, 2500)); a = await (await fetch(B + "/oauth/approval?id=" + id)).json(); }
  assert.ok(a.redirect, JSON.stringify(a));
});
test("a sign-in approved by someone other than Damian is never granted", async () => {
  const { url } = await startSignIn(B, {});
  assert.deepStrictEqual(await approveFromPage(B, url, STRANGER), { waiting: true });
});
test("Damian's Cliq approval completes OAuth: iss, PKCE, audience, single-use codes, rotating client-bound refresh", async () => {
  const { reg, verifier, url } = await startSignIn(B, {});
  const a = await approveFromPage(B, url, DAMIAN);
  const u = new URL(a.redirect);
  assert.strictEqual(u.origin + u.pathname, REDIRECT); assert.strictEqual(u.searchParams.get("state"), "st"); assert.strictEqual(u.searchParams.get("iss"), B);
  const base = { grant_type: "authorization_code", code: u.searchParams.get("code"), client_id: reg.client_id, redirect_uri: REDIRECT, resource: B + "/mcp" };
  assert.strictEqual((await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier" })))).status, 400);
  assert.strictEqual((await fetch(B + "/oauth/token", form(Object.assign({}, base, { resource: "https://other.example/mcp", code_verifier: verifier })))).status, 400, "audience");
  const t = await (await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: verifier })))).json();
  assert.ok(t.access_token && t.refresh_token); assert.strictEqual(t.token_type, "Bearer");
  assert.strictEqual(JSON.parse(Buffer.from(t.access_token.split(".")[1], "base64url")).aud, B + "/mcp");
  assert.strictEqual((await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: verifier })))).status, 400, "code reuse");
  assert.strictEqual((await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: "someone-else" }))).status, 400, "client binding");
  const t2 = await (await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: reg.client_id, resource: B + "/mcp" }))).json();
  assert.ok(t2.access_token && t2.refresh_token !== t.refresh_token, "rotated");
  const retry = await (await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token }))).json();
  assert.strictEqual(retry.refresh_token, t2.refresh_token, "a retried refresh within 60 s gets the same answer, not a new head");
  assert.ok(chats.CT_AL.some((m) => /^\[relay\] chatgpt-oauth head fam=\S+ n=1 /.test(m.content.text)), "head marker written to #oc-alerts");
  assert.ok(!chats.CT_AL.some((m) => /cgpt\./.test(m.content.text)), "no token is ever written to the channel");
  access = t2.access_token; session = { reg, t2 };
});
test("MCP: initialize, tools/list with oauth2 securitySchemes, honest annotations", async () => {
  const i = await mcp(B, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }, access);
  assert.strictEqual(i.json.result.protocolVersion, "2025-06-18");
  const tools = (await mcp(B, "tools/list", {}, access)).json.result.tools;
  assert.deepStrictEqual(tools.map((t) => t.name), ["ask_claude_code", "get_claude_code_response", "check_messages"]);
  for (const t of tools) assert.deepStrictEqual(t.securitySchemes, [{ type: "oauth2", scopes: ["claude.ask"] }]);
  assert.strictEqual(tools[0].annotations.readOnlyHint, false, "sending is a write; never disguised as read-only");
});
test("a browser Origin other than chatgpt.com is refused", async () => {
  assert.strictEqual((await mcp(B, "tools/list", {}, access, { Origin: "https://evil.example" })).status, 403);
  assert.strictEqual((await mcp(B, "tools/list", {}, access, { Origin: "https://chatgpt.com" })).status, 200);
});
test("ask_claude_code reaches claude-code, gets its correlated reply, and a retry does not execute twice", async () => {
  let executions = 0;
  const bridge = (async () => {   // stand-in for the Mac bridge: claude-code listens and answers each request once
    for (let i = 0; i < 40; i++) {
      const w = await (await fetch(B + "/wait?since=0&timeout=2", { headers: { Authorization: "Bearer " + CC_KEY } })).json();
      for (const m of w.messages || []) if (m.envelope && m.envelope.type === "request" && m.envelope.from === "chatgpt") {
        executions++;
        assert.strictEqual(m.envelope.sender_class, "outside");
        await fetch(B + "/messages", { method: "POST", headers: { Authorization: "Bearer " + CC_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ to: "chatgpt", type: "ack", correlation_id: m.envelope.correlation_id, payload: "STATUS: ACK. WelcomeIQ: Slack app install pending." }) });
        return;
      }
    }
  })();
  const call = (args) => mcp(B, "tools/call", { name: "ask_claude_code", arguments: args }, access);
  const r = await call({ message: "Status of the WelcomeIQ project?", idempotency_key: "test-key-0001", wait_seconds: 20 });
  await bridge;
  const s = r.json.result.structuredContent;
  assert.strictEqual(s.ok, true); assert.strictEqual(s.state, "answered");
  assert.match(s.correlation_id, /^cgpt-[0-9a-f]{20}$/); assert.match(s.response, /WelcomeIQ/);
  const again = (await call({ message: "Status of the WelcomeIQ project?", idempotency_key: "test-key-0001", wait_seconds: 0 })).json.result.structuredContent;
  assert.strictEqual(again.duplicate, true); assert.strictEqual(again.correlation_id, s.correlation_id);
  assert.strictEqual(msgs.filter((m) => m.content.text.includes(s.correlation_id) && m.content.text.includes('"type":"request"')).length, 1, "one request on the bus");
  assert.strictEqual(executions, 1);
  const g = (await mcp(B, "tools/call", { name: "get_claude_code_response", arguments: { correlation_id: s.correlation_id } }, access)).json.result.structuredContent;
  assert.strictEqual(g.response, s.response);
  const conflict = (await call({ message: "Something else", idempotency_key: "test-key-0001", wait_seconds: 0 })).json.result.structuredContent;
  assert.strictEqual(conflict.error, "idempotency_conflict");
});
test("delegate_task: hidden unless switched on; posts the task to claude-code; in_progress until the result; bad ids refused", async () => {
  assert.ok(!(await mcp(B, "tools/list", {}, access)).json.result.tools.some((t) => t.name === "delegate_task"), "hidden when off");
  const D = await startRelay({ CHATGPT_DELEGATION_ENABLED: "1", PUBLIC_BASE_URL: B });   // same address and secret, so the token works
  assert.ok((await mcp(D, "tools/list", {}, access)).json.result.tools.some((t) => t.name === "delegate_task"));
  const bad = (await mcp(D, "tools/call", { name: "delegate_task", arguments: { project_id: "abc", task_id: "1", instruction: "x", idempotency_key: "deleg-bad-01" } }, access)).json.result.structuredContent;
  assert.strictEqual(bad.error, "invalid_task");
  let seen;
  const bridge = (async () => {   // stand-in for the Mac executor: STARTED at once, the result later
    for (let i = 0; i < 40; i++) {
      const w = await (await fetch(D + "/wait?since=0&timeout=2", { headers: { Authorization: "Bearer " + CC_KEY } })).json();
      const m = (w.messages || []).find((x) => x.envelope && x.envelope.type === "request" && x.envelope.payload && x.envelope.payload.kind === "delegated_task");
      if (!m) continue;
      seen = m.envelope;
      const post = (type, payload) => fetch(D + "/messages", { method: "POST", headers: { Authorization: "Bearer " + CC_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ to: "chatgpt", type, correlation_id: m.envelope.correlation_id, payload }) });
      await post("ack", "STATUS: STARTED " + m.envelope.correlation_id + " on task 1156860000000000002.");
      await new Promise((r) => setTimeout(r, 1500));
      await post("result", "Added the README line in commit abc123.\nSTATUS: COMPLETE");
      return;
    }
  })();
  const r = (await mcp(D, "tools/call", { name: "delegate_task", arguments: { project_id: "1156860000000000001", task_id: "1156860000000000002", instruction: "Add a README line", idempotency_key: "deleg-test-01", wait_seconds: 0 } }, access)).json.result.structuredContent;
  assert.strictEqual(r.ok, true);
  await new Promise((res) => setTimeout(res, 700));
  const mid = (await mcp(D, "tools/call", { name: "get_claude_code_response", arguments: { correlation_id: r.correlation_id } }, access)).json.result.structuredContent;
  assert.strictEqual(mid.state, "in_progress", "STARTED is not completion");
  const done = (await mcp(D, "tools/call", { name: "get_claude_code_response", arguments: { correlation_id: r.correlation_id, wait_seconds: 15 } }, access)).json.result.structuredContent;
  await bridge;
  assert.strictEqual(done.state, "completed"); assert.match(done.response, /abc123/);
  assert.deepStrictEqual({ kind: seen.payload.kind, task: seen.payload.task_id, from: seen.from, cls: seen.sender_class }, { kind: "delegated_task", task: "1156860000000000002", from: "chatgpt", cls: "outside" });
});
test("read_channel: only classified project/function channels listed on the relay; read-only; secrets withheld; personal channels refused", async () => {
  const SYS = "CT_1424665092475656932_665429212", MARY = "CT_1424665092475708917_665429212", BUS = "CT_1424665089452738432_665429212";
  const t0 = Date.now();
  chats[SYS] = [
    { id: "s1", time: t0 - 3000, sender: { id: DAMIAN, name: "Damian Knowles" }, content: { text: "task 1156860000000000001/1156860000000000002: add the README line" } },
    { id: "s2", time: t0 - 2000, sender: { id: DAMIAN, name: "Damian Knowles" }, content: { text: "STATUS: STARTED cliq-0123 on task 1156860000000000002" } },
    { id: "s3", time: t0 - 1000, sender: { id: DAMIAN, name: "Damian Knowles" }, content: { text: "use sk-abcdefghijklmnopqrstuvwxyz123456 for it" } }];
  chats[MARY] = [{ id: "m1", time: t0, sender: { id: DAMIAN, name: "Damian Knowles" }, content: { text: "personal note" } }];
  const before = JSON.stringify(chats);
  assert.ok(!(await mcp(B, "tools/list", {}, access)).json.result.tools.some((t) => t.name === "read_channel"), "hidden when no channel is approved");
  // Mary-Alice and #agent-bus are listed on the relay by mistake, plus an unclassified id: all three must be rejected by classification.
  const R = await startRelay({ CHATGPT_READ_CHANNELS: [SYS, MARY, BUS, "CT_9999_unclassified"].join(","), PUBLIC_BASE_URL: B });
  const tool = (await mcp(R, "tools/list", {}, access)).json.result.tools.find((t) => t.name === "read_channel");
  assert.ok(tool && tool.annotations.readOnlyHint === true);
  const call = async (a) => (await mcp(R, "tools/call", { name: "read_channel", arguments: a }, access)).json.result.structuredContent;
  assert.deepStrictEqual((await call({})).channels.map((c) => c.channel), ["ocsystemsautomation"]);
  const r = await call({ channel: "ocsystemsautomation" });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.messages.map((m) => m.id), ["s1", "s2", "s3"], "oldest first");
  assert.match(r.messages[0].text, /task 1156860000000000001\/1156860000000000002/);
  assert.match(r.messages[2].text, /^\[withheld/); assert.ok(!/sk-abc/.test(JSON.stringify(r)), "secret never returned");
  assert.deepStrictEqual((await call({ channel: "ocsystemsautomation", since: r.messages[1].time })).messages.map((m) => m.id), ["s3"]);
  for (const ch of ["occommand", "agentbus", "muse", "assistant", "nonexistent"]) assert.strictEqual((await call({ channel: ch })).error, "channel_not_allowed", ch);
  assert.strictEqual(JSON.stringify(chats), before, "nothing posted to any channel");
});
test("unauthorized recipients and secrets are refused", async () => {
  const r = (await mcp(B, "tools/call", { name: "ask_claude_code", arguments: { message: "hi", idempotency_key: "test-key-0002", recipient: "finance" } }, access)).json.result;
  assert.strictEqual(r.isError, true); assert.strictEqual(r.structuredContent.error, "recipient_not_allowed");
  const s = (await mcp(B, "tools/call", { name: "ask_claude_code", arguments: { message: "use key sk-abcdefghijklmnopqrstuvwxyz123", idempotency_key: "test-key-0003", wait_seconds: 0 } }, access)).json.result;
  assert.strictEqual(s.structuredContent.error, "blocked_sensitive_content");
});
test("reply window: claude-code may start a message to chatgpt after chatgpt asked it; check_messages shows and acknowledges it", async () => {
  // chatgpt asked claude-code in the ask_claude_code test above, so the 24-hour window is open.
  const post = (base, body) => fetch(base + "/messages", { method: "POST", headers: { Authorization: "Bearer " + CC_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const r = await post(B, { to: "chatgpt", type: "request", correlation_id: "cc-start-0001", payload: "Fresh Start matrix draft is ready for your wording." });
  assert.strictEqual(r.status, 201);
  const call = (args) => mcp(B, "tools/call", { name: "check_messages", arguments: args }, access);
  const got = (await call({})).json.result.structuredContent;
  assert.strictEqual(got.ok, true);
  const m = got.messages.find((x) => x.correlation_id === "cc-start-0001");
  assert.ok(m, "the message is visible to chatgpt"); assert.strictEqual(m.from, "claude-code"); assert.match(m.text, /Fresh Start/);
  assert.ok(!got.messages.some((x) => String(x.correlation_id).startsWith("cgpt-")), "replies to chatgpt's own requests stay in get_claude_code_response");
  assert.strictEqual(msgs.filter((x) => x.content.text.includes("cc-start-0001") && x.content.text.includes('"type":"ack"') && x.content.text.includes('"from":"chatgpt"')).length, 1, "read once, acknowledged once");
  await call({});
  assert.strictEqual(msgs.filter((x) => x.content.text.includes("cc-start-0001") && x.content.text.includes('"type":"ack"')).length, 1, "a second read does not acknowledge again");
  const later = (await call({ since: got.latest })).json.result.structuredContent;
  assert.ok(!later.messages.some((x) => x.correlation_id === "cc-start-0001"), "since filters what was already read");
  const st = await (await fetch(B + "/status?correlation_id=cc-start-0001", { headers: { Authorization: "Bearer " + CC_KEY } })).json();
  assert.strictEqual(st.state, "acknowledged");
});
test("reply window: outside the window the relay refuses claude-code's message to chatgpt, and raises no not-listening alert", async () => {
  const W = await startRelay({ REPLY_WINDOW_H: "0.0001" });   // a 0.36-second window
  await new Promise((r) => setTimeout(r, 1000));
  const r = await fetch(W + "/messages", { method: "POST", headers: { Authorization: "Bearer " + CC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ to: "chatgpt", type: "request", correlation_id: "cc-late-0001", payload: "Too late." }) });
  assert.strictEqual(r.status, 403);
  assert.match((await r.json()).detail, /has not contacted claude-code/);
  assert.ok(!msgs.some((x) => x.content.text.includes("cc-late-0001") && x.content.text.includes('"type":"request"')), "nothing was posted");
  // An invented cgpt- id does not open the window: only a real chatgpt request with that id does.
  const forged = await fetch(W + "/messages", { method: "POST", headers: { Authorization: "Bearer " + CC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ to: "chatgpt", type: "request", correlation_id: "cgpt-0123456789abcdef0123", payload: "Sneaking in." }) });
  assert.strictEqual(forged.status, 403);
  assert.match((await forged.json()).detail, /has not contacted claude-code/);
});
test("cutting chatgpt off from the admin console stops the connector at once", async () => {
  await fetch(B + "/admin/cutoff?agent=chatgpt", { method: "POST", headers: { Authorization: "Bearer " + OPS_KEY } });
  assert.strictEqual((await mcp(B, "tools/list", {}, access)).status, 401);
  await fetch(B + "/admin/restore?agent=chatgpt", { method: "POST", headers: { Authorization: "Bearer " + OPS_KEY } });
  assert.strictEqual((await mcp(B, "tools/list", {}, access)).status, 200);
});
test("a token from one OAuth secret is worthless under another (rotation revokes all)", async () => {
  // same public address (so the audience matches), different secret: only the signature differs
  const other = await startRelay({ CHATGPT_OAUTH_SECRET: crypto.randomBytes(32).toString("base64url"), PUBLIC_BASE_URL: B });
  assert.strictEqual((await mcp(B, "tools/list", {}, access)).status, 200);
  assert.strictEqual((await mcp(other, "tools/list", {}, access)).status, 401);
});
test("off by default: no switch, or no dedicated secret, means every connector path is a 404", async () => {
  for (const extra of [{ CHATGPT_MCP_ENABLED: "" }, { CHATGPT_OAUTH_SECRET: "" }, { CHATGPT_OAUTH_SECRET: "too-short" }]) {
    const b = await startRelay(extra);
    for (const p of ["/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server", "/oauth/authorize"])
      assert.strictEqual((await fetch(b + p)).status, 404, JSON.stringify(extra) + " " + p);
  }
});
test("without the OUTSIDE_ROUTES grant, the relay itself refuses chatgpt -> claude-code", async () => {
  const b = await startRelay({ OUTSIDE_ROUTES: "muse>maryalice" });
  const { verifier, reg, url } = await startSignIn(b, {});
  const ap = await approveFromPage(b, url, DAMIAN); assert.ok(ap.redirect, JSON.stringify(ap));
  const code = new URL(ap.redirect).searchParams.get("code");
  const t = await (await fetch(b + "/oauth/token", form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }))).json();
  const r = (await mcp(b, "tools/call", { name: "ask_claude_code", arguments: { message: "hi", idempotency_key: "test-key-route", wait_seconds: 0 } }, t.access_token)).json.result;
  assert.strictEqual(r.structuredContent.error, "not_allowed");
});

test("refresh-token replay is refused after a relay restart, and reuse revokes the whole sign-in", async () => {
  // a fresh relay with the same secret and address stands in for the restarted one: it has no memory, only #oc-alerts
  const { reg, verifier, url } = await startSignIn(B, {});
  const code = new URL((await approveFromPage(B, url, DAMIAN)).redirect).searchParams.get("code");
  const t0 = await (await fetch(B + "/oauth/token", form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }))).json();
  const t1 = await (await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t0.refresh_token }))).json();
  assert.ok(t1.refresh_token);
  const R = await startRelay({ PUBLIC_BASE_URL: B });
  const port = (u) => u.replace(B, R);
  assert.strictEqual((await fetch(port(B) + "/oauth/token", form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }))).status, 400, "code is single-use across restarts");
  const t2 = await (await fetch(port(B) + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t1.refresh_token }))).json();
  assert.ok(t2.access_token, "the current head still works after the restart");
  await new Promise((r) => setTimeout(r, 100));
  const replay = await fetch(port(B) + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t0.refresh_token }));
  assert.strictEqual(replay.status, 400, "an old refresh token is refused after the restart");
  assert.strictEqual((await fetch(port(B) + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t2.refresh_token }))).status, 400, "the replay revoked the whole sign-in");
  const R2 = await startRelay({ PUBLIC_BASE_URL: B });
  assert.strictEqual((await fetch(R2 + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t2.refresh_token }))).status, 400, "revocation survives another restart");
});
test("refresh fails closed when the state channel is not configured", async () => {
  const b = await startRelay({ OC_ALERTS_CHAT: "" });
  const { reg, verifier, url } = await startSignIn(b, {});
  const code = new URL((await approveFromPage(b, url, DAMIAN)).redirect).searchParams.get("code");
  assert.strictEqual((await fetch(b + "/oauth/token", form({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: REDIRECT, code_verifier: verifier }))).status, 503);
});

// Independent conformance: the official MCP TypeScript SDK client does discovery, DCR, PKCE and resource on its own.
const SDK = [process.env.MCP_SDK_DIR, path.join(__dirname, "../../../agent-bus-relay/welcomeiq/node_modules/@modelcontextprotocol/sdk")].find((d) => d && fs.existsSync(path.join(d || "", "package.json")));
test("official MCP SDK client: OAuth discovery, DCR, PKCE, token, then tools/call", { skip: !SDK && "MCP SDK not found" }, async () => {
  const { auth } = require(path.join(SDK, "dist/cjs/client/auth.js"));
  const { Client } = require(path.join(SDK, "dist/cjs/client/index.js"));
  const { StreamableHTTPClientTransport } = require(path.join(SDK, "dist/cjs/client/streamableHttp.js"));
  const store = {};
  const provider = {
    get redirectUrl() { return REDIRECT; },
    get clientMetadata() { return { client_name: "SDK conformance", redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }; },
    clientInformation: () => store.client, saveClientInformation: (c) => { store.client = c; },
    tokens: () => store.tokens, saveTokens: (t) => { store.tokens = t; },
    redirectToAuthorization: (u) => { store.authUrl = u; },
    saveCodeVerifier: (v) => { store.verifier = v; }, codeVerifier: () => store.verifier,
  };
  assert.strictEqual(await auth(provider, { serverUrl: B + "/mcp" }), "REDIRECT");
  assert.strictEqual(store.authUrl.searchParams.get("code_challenge_method"), "S256");
  assert.strictEqual(store.authUrl.searchParams.get("resource"), B + "/mcp");
  const back = new URL((await approveFromPage(B, store.authUrl.href, DAMIAN)).redirect);
  assert.strictEqual(await auth(provider, { serverUrl: B + "/mcp", authorizationCode: back.searchParams.get("code") }), "AUTHORIZED");
  const client = new Client({ name: "sdk-conformance", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(B + "/mcp"), { authProvider: provider }));
  const { tools } = await client.listTools();
  assert.deepStrictEqual(tools.map((t) => t.name), ["ask_claude_code", "get_claude_code_response", "check_messages"]);
  const r = await client.callTool({ name: "get_claude_code_response", arguments: { correlation_id: "cgpt-00000000000000000000" } });
  assert.strictEqual(r.structuredContent.error, "unknown_correlation_id");
  await client.close();
});
