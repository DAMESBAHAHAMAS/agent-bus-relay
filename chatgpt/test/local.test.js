// Offline proof of the ChatGPT connector: the REAL relay (server.js) runs against a mock Zoho/Cliq on localhost.
// No real credential, channel or agent is touched. Run: node --test chatgpt/test/
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

const DAMIAN = "111", STRANGER = "999", CC_KEY = "test-key-claude-code", OPS_KEY = "test-key-ops";
const msgs = []; let seq = 0;
const mock = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/oauth/v2/token")) return j(200, { access_token: "mock", expires_in: 3600 });
    if (req.method === "GET" && /^\/chats\/[^/]+\/messages/.test(req.url)) return j(200, { data: msgs.slice(-100).reverse() });
    if (req.method === "POST" && (/^\/channelsbyname\//.test(req.url))) {
      const id = String(++seq); msgs.push({ id, time: Date.now(), sender: { id: DAMIAN, name: "Damian" }, content: { text: JSON.parse(body).text } });
      return j(200, { message_id: id });
    }
    return j(200, { ok: true });
  });
});
const human = (sender, text) => msgs.push({ id: String(++seq), time: Date.now(), sender: { id: sender, name: "x" }, content: { text } });

let relay, B;
const port = 18000 + Math.floor(Math.random() * 1000);
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  const M = "http://127.0.0.1:" + mock.address().port;
  B = "http://127.0.0.1:" + port;
  relay = spawn(process.execPath, [path.join(__dirname, "../../server.js")], { stdio: "ignore", env: Object.assign({}, process.env, {
    PORT: String(port), ZOHO_ACCOUNTS_URL: M, CLIQ_API_BASE: M, CHANNEL_UNIQUE_NAME: "agentbus", CHANNEL_CHAT_ID: "CT_1",
    SERVICE_KEYS: "claude-code:" + CC_KEY + ",ops:" + OPS_KEY, ADMIN_AGENTS: "ops", EXTERNAL_AGENTS: "muse", DAMIAN_CLIQ_IDS: DAMIAN,
    BUS_SIGNING_SECRET: "test-signing-secret", POLL_MS: "5000", OUTSIDE_ROUTES: "muse>maryalice,chatgpt>claude-code",
    CHATGPT_MCP_ENABLED: "1", PUBLIC_BASE_URL: B }) });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(B + "/healthz")).ok) return; } catch (e) {} await new Promise((r) => setTimeout(r, 100)); }
  throw Error("relay did not start");
});
after(() => { relay.kill(); mock.close(); });

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
let access, refresh;
async function signIn(approver) {
  const reg = await (await fetch(B + "/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "ChatGPT" }) })).json();
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st", resource: B + "/mcp", scope: "claude.ask" });
  const html = await (await fetch(B + "/oauth/authorize?" + q)).text();
  const code = html.match(/approve chatgpt ([A-Z0-9]{4}-[A-Z0-9]{4})/)[1];
  const id = html.match(/const id="([^"]+)"/)[1];
  assert.deepStrictEqual(await (await fetch(B + "/oauth/approval?id=" + id)).json(), { waiting: true });
  human(approver, "approve chatgpt " + code);
  await new Promise((r) => setTimeout(r, 5200));   // relay re-reads the channel
  return { reg, verifier, id };
}
async function mcp(method, params, token) {
  const r = await fetch(B + "/mcp", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, token ? { Authorization: "Bearer " + token } : {}),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
}

test("discovery metadata advertises OAuth with PKCE S256 and the MCP resource", async () => {
  const prm = await (await fetch(B + "/.well-known/oauth-protected-resource/mcp")).json();
  assert.strictEqual(prm.resource, B + "/mcp");
  const asm = await (await fetch(B + "/.well-known/oauth-authorization-server")).json();
  assert.deepStrictEqual(asm.code_challenge_methods_supported, ["S256"]);
});
test("unauthenticated and forged requests are rejected with a resource_metadata challenge", async () => {
  const r = await mcp("tools/list", {});
  assert.strictEqual(r.status, 401);
  assert.match(r.headers.get("www-authenticate"), /resource_metadata=/);
  assert.strictEqual((await mcp("tools/list", {}, "cgpt.eyJrIjoiYWNjZXNzIn0.forged")).status, 401);
});
test("client registration refuses redirect addresses outside chatgpt.com", async () => {
  const r = await fetch(B + "/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["https://evil.example/cb"] }) });
  assert.strictEqual(r.status, 400);
});
test("a sign-in approved by someone other than Damian is never granted", async () => {
  const { id } = await signIn(STRANGER);
  assert.deepStrictEqual(await (await fetch(B + "/oauth/approval?id=" + id)).json(), { waiting: true });
});
test("Damian's Cliq approval completes OAuth; PKCE and single-use codes are enforced", async () => {
  const { reg, verifier, id } = await signIn(DAMIAN);
  const a = await (await fetch(B + "/oauth/approval?id=" + id)).json();
  const u = new URL(a.redirect);
  assert.strictEqual(u.origin + u.pathname, REDIRECT); assert.strictEqual(u.searchParams.get("state"), "st");
  const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
  const base = { grant_type: "authorization_code", code: u.searchParams.get("code"), client_id: reg.client_id, redirect_uri: REDIRECT };
  assert.strictEqual((await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier" })))).status, 400);
  const t = await (await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: verifier })))).json();
  assert.ok(t.access_token && t.refresh_token);
  assert.strictEqual((await fetch(B + "/oauth/token", form(Object.assign({}, base, { code_verifier: verifier })))).status, 400, "code reuse");
  const t2 = await (await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token }))).json();
  assert.ok(t2.access_token);
  assert.strictEqual((await fetch(B + "/oauth/token", form({ grant_type: "refresh_token", refresh_token: t.refresh_token }))).status, 400, "refresh reuse");
  access = t2.access_token; refresh = t2.refresh_token;
});
test("MCP: initialize and tools/list", async () => {
  const i = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }, access);
  assert.strictEqual(i.json.result.protocolVersion, "2025-06-18");
  const l = await mcp("tools/list", {}, access);
  assert.deepStrictEqual(l.json.result.tools.map((t) => t.name), ["ask_claude_code", "get_claude_code_response"]);
});
test("ask_claude_code reaches claude-code, gets its correlated reply, and a retry does not execute twice", async () => {
  // stand-in for the Mac bridge: claude-code listens, and answers each request once
  let executions = 0;
  const bridge = (async () => {
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
  const call = (args) => mcp("tools/call", { name: "ask_claude_code", arguments: args }, access);
  const r = await call({ message: "Status of the WelcomeIQ project?", idempotency_key: "test-key-0001", wait_seconds: 20 });
  await bridge;
  const s = r.json.result.structuredContent;
  assert.strictEqual(s.ok, true); assert.strictEqual(s.state, "answered");
  assert.match(s.correlation_id, /^cgpt-[0-9a-f]{20}$/); assert.match(s.response, /WelcomeIQ/);
  const again = (await call({ message: "Status of the WelcomeIQ project?", idempotency_key: "test-key-0001", wait_seconds: 0 })).json.result.structuredContent;
  assert.strictEqual(again.duplicate, true); assert.strictEqual(again.correlation_id, s.correlation_id);
  assert.strictEqual(msgs.filter((m) => m.content.text.includes(s.correlation_id) && m.content.text.includes('"type":"request"')).length, 1, "one request on the bus");
  assert.strictEqual(executions, 1);
  const g = (await mcp("tools/call", { name: "get_claude_code_response", arguments: { correlation_id: s.correlation_id } }, access)).json.result.structuredContent;
  assert.strictEqual(g.response, s.response);
  const conflict = (await call({ message: "Something else", idempotency_key: "test-key-0001", wait_seconds: 0 })).json.result.structuredContent;
  assert.strictEqual(conflict.error, "idempotency_conflict");
});
test("unauthorized recipients and secrets are refused", async () => {
  const r = (await mcp("tools/call", { name: "ask_claude_code", arguments: { message: "hi", idempotency_key: "test-key-0002", recipient: "finance" } }, access)).json.result;
  assert.strictEqual(r.isError, true); assert.strictEqual(r.structuredContent.error, "recipient_not_allowed");
  const s = (await mcp("tools/call", { name: "ask_claude_code", arguments: { message: "use key sk-abcdefghijklmnopqrstuvwxyz123", idempotency_key: "test-key-0003", wait_seconds: 0 } }, access)).json.result;
  assert.strictEqual(s.structuredContent.error, "blocked_sensitive_content");
});
test("cutting chatgpt off from the admin console stops the connector at once", async () => {
  await fetch(B + "/admin/cutoff?agent=chatgpt", { method: "POST", headers: { Authorization: "Bearer " + OPS_KEY } });
  assert.strictEqual((await mcp("tools/list", {}, access)).status, 401);
  await fetch(B + "/admin/restore?agent=chatgpt", { method: "POST", headers: { Authorization: "Bearer " + OPS_KEY } });
  assert.strictEqual((await mcp("tools/list", {}, access)).status, 200);
});
