# ChatGPT ↔ Claude Code connector: handoff record

Project owner: Damian. Assigned 2026-10-18 to a separate Claude Code session. Branch `chatgpt-claude-connector`
(worktree `~/Developer/agent-bus-relay-chatgpt`). This file is the resume point: read it first, do not repeat discovery.

## DEPLOYMENT LOG (2026-10-18, Damian said GO at ~13:25 EDT)
- Codex/WelcomeIQ coordination: that session committed server.js together with welcomeiq/relay.cjs (e959aa3, local), which resolved the
  missing dependency. Merged on main: origin/main 1d110f7 into e959aa3 (0d51ef7), then this branch (475afb2). Merged tree: connector tests
  17/17, welcomeiq tests 14/14. Note: ops/COORDINATION-chatgpt-connector.md (untracked, main checkout).
- Refresh-token replay fix (ef5752d): token families with head rotation; reuse of an old token revokes the family and alerts Damian.
  Head moves are written first as HMAC-signed markers in #oc-alerts (format `[relay] chatgpt-oauth head fam=… n=… g=… sig=…`; no
  token is ever written) and re-read after a restart; if the state cannot be read or written, refresh fails closed. 60-second retry grace.
  Auth codes are single-use across restarts too (code id = family id).
- 13:33 `bus-admin.py chatgpt stage-secret`: CHATGPT_OAUTH_SECRET present in Render (64 chars) and Keychain `agent-bus-chatgpt-oauth-secret`.
- 13:36 pushed main 475afb2; Render deploy live 17:36:11Z; /healthz ok; connector paths 404 (off).
- 13:37 `bus-admin.py chatgpt activate`: CHATGPT_MCP_ENABLED=1, OUTSIDE_ROUTES=muse>maryalice,chatgpt>claude-code; deploy live.
  Then PRM 200, AS metadata 200, /mcp without token 401 with the resource_metadata challenge (6/6 stable checks).
- 13:39 bridge restarted (launchctl kickstart): pid 74932, all 15 agents listening, WELCOMEIQ_ENABLED unset (no WelcomeIQ worker).
- Live production checks: official MCP SDK 1.29.0 `auth()` → REDIRECT with DCR client issued, S256, resource = /mcp; no token 401;
  forged token 401; hostile redirect registration 400; bogus code 400.
- Live `tests/run-tests.sh security`: 31 pass, 2 fail, neither from this work: (a) the key scan matches a sha256 backup hash in
  ops/day3-verification-2026-10-17.md (since d9df86c; not a key); (b) the unreachable-agent alert check counts leftover in-memory audit
  events, and there were none after the restart. (b) was then exercised directly: claude-compliance and chatgpt were cut off on the
  running relay, a request was sent (cid 1672a3ef-6ce5-4db1-af51-cfce92d5e7e7), and the audit shows `human_alert manual status 200`.
  Both were restored. The emergency cut-off is proven live for chatgpt.

## Discovery findings
- The relay (`server.js`, Render `agent-bus-relay`, public HTTPS) is the only door to `#agent-bus`. Identity comes from a service key.
  Every message is an HMAC-signed envelope in Cliq (permanent audit), with correlation ids and an ack ledger.
- Outside agents (`EXTERNAL_AGENTS` = muse,gpt) reach only `FRONT_DOOR` (bizops) plus `OUTSIDE_ROUTES`. Render does not set
  OUTSIDE_ROUTES today, so the code default `muse>maryalice` applies (checked 2026-10-18 with the Render API).
- `claude-code` is a bus agent. The bridge wakes it as `claude -p --tools "" --strict-mcp-config` in `~/.agent-bus/claude-code` (no tools).
- `gpt` on the bus is an OpenClaw agent, not ChatGPT. Codex's `welcomeiq/chatgpt.mjs` is a separate, unactivated ChatGPT→Codex adapter.
- In `claude -p`, CLAUDE.md `@imports` of files outside the cwd (or symlinks to them) are not loaded; files inside it are.
- ChatGPT remote MCP auth: OAuth 2.1 + PKCE (CIMD, DCR or predefined client), or no auth. No static API keys.
  (developers.openai.com/plugins/build/auth). Custom GPT Actions take API keys but custom GPTs are being retired.
- OpenAI also offers a Secure MCP Tunnel (developers.openai.com/api/docs/guides/secure-mcp-tunnels): ChatGPT reaches a PRIVATE MCP server
  through an outbound `tunnel-client`. It needs a Platform organization API key for the tunnel-client and a new Mac service. It is an
  alternative if Damian prefers no new public routes; not built.

## Architecture
```
ChatGPT (developer-mode custom MCP server)
  -> POST https://agent-bus-relay.onrender.com/mcp      OAuth bearer, scope claude.ask, aud = that URL
  -> relay posts a signed request: from "chatgpt" (OUTSIDE agent) to "claude-code", correlation_id cgpt-<hash of idempotency key>
  -> Mac bridge wakes claude-code (no tools) with read-only project copies
  -> claude-code's own reply on the bus wakes the waiting MCP call (or ChatGPT polls get_claude_code_response)
```
Changed files on the branch: `chatgpt/connector.js` (new), `chatgpt/test/local.test.js` (new), `server.js` (+6),
`bridge/bus-bridge.js` (+13, `refreshContext`), `admin/bus-admin.py` (`chatgpt` commands, persistent cutoff), this file.

Tools: `ask_claude_code {message, idempotency_key, recipient=claude-code, wait_seconds<=45, default 25}` and
`get_claude_code_response {correlation_id, wait_seconds}`. Both return correlation_id, state (pending | answered | completed | blocked |
failed | escalated), response, error, requested_at, responded_at, request_message_id, response_message_id. `ask_claude_code` is
annotated readOnlyHint=false, honestly: it posts a request.

## OpenAI OAuth checklist (developers.openai.com/plugins/build/auth), checked 2026-10-18
| Requirement | Implementation | Evidence |
|---|---|---|
| Protected resource metadata at /.well-known/oauth-protected-resource (and the /mcp suffix) with `resource`, `authorization_servers` | Both paths, identical | test "OpenAI checklist" |
| AS metadata at /.well-known/oauth-authorization-server; `issuer` identical to `authorization_servers[0]` | Yes | same |
| `code_challenge_methods_supported` includes S256; PKCE enforced | S256 only; plain and missing are refused; wrong verifier refused | tests |
| `token_endpoint_auth_methods_supported` | `["none"]` (public client + PKCE) | test |
| Client identification | DCR (`registration_endpoint`). CIMD not advertised, so ChatGPT uses DCR (doc: DCR is used when CIMD is unavailable) | SDK test registers via DCR |
| Redirect URIs | DCR accepts only https URIs on chatgpt.com, no port and no userinfo; covers both `/connector_platform_oauth_redirect` and `/connector/oauth/{callback_id}` | test (4 hostile URIs refused) |
| RFC 9207 `iss` | Advertised; `iss` returned on every success and error redirect, exactly the issuer string | tests |
| `resource` on authorize and token; audience | A mismatched resource is refused on both; the token `aud` = the /mcp URL and is checked on every request | tests |
| Refresh tokens | Issued; rotated on use; reuse refused; bound to the client; 30 days; revoked by a generation bump or secret rotation | tests |
| Scopes | `claude.ask` only; no OIDC scopes advertised (ChatGPT would request them) | test |
| 401 challenge | `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp", scope="claude.ask"` | test |
| Per-tool securitySchemes | `[{type:"oauth2",scopes:["claude.ask"]}]` on both tools (and `_meta`) | test |
| Token verification on every call | HMAC signature, kind, generation, exp, sub, aud, scope, cut-off list | tests |
| mTLS client cert from OpenAI | NOT checked: Render terminates TLS, so the relay cannot see the client certificate. The doc lists mTLS as a way to authenticate ChatGPT as the client; user authorization is the OAuth token, which is enforced. Optional hardening: allowlist ChatGPT's published egress IP ranges. | n/a |
| MCP transport: Origin validation | A browser Origin other than https://chatgpt.com is refused (403) | test |
| Official client interoperability | MCP TypeScript SDK 1.29.0 `auth()` + StreamableHTTPClientTransport complete discovery → DCR → PKCE → token → listTools → callTool | test |

Known residual risks (for Damian to accept):
- Refresh-token reuse detection is held in memory. After a relay restart, an already-used refresh token could be replayed once within
  its 30 days. Mitigations: tokens are only ever issued to chatgpt.com redirects after Damian's Cliq approval; `revoke-tokens` revokes all.
- Rate-limit and idempotency memory also reset on restart. Duplicate execution is still prevented by the bus (deterministic correlation id
  plus the bridge's done-set), and the 20/min and loop limits are recomputed.
- The hand-rolled HMAC tokens are not JWTs from an identity provider. OpenAI recommends SDK helpers; the verification path is covered by tests.

## ChatGPT plan check (condition 4): NOT VERIFIED
- Damian's ChatGPT plan is **Plus**, from the `chatgpt_plan_type` claim of the local Codex sign-in, issued 2026-10-18 04:56. Only that claim was read; no token was printed or copied.
- OpenAI's help article "Developer mode and MCP apps in ChatGPT" (help.openai.com/en/articles/12584461) says full MCP, including
  write/modify actions, is in beta for Business, Enterprise and Edu. September 2025 launch coverage said Plus and Pro had write actions in
  developer mode. A 2026 third-party guide notes that the docs conflict. The help center blocks automated reads, so this was not confirmed first-hand.
- Conclusion: it cannot be assumed that Plus permits `ask_claude_code`. A non-destructive in-app check by Damian settles it (below).
- If Plus does not permit write tools: (a) a Business workspace, which is a paid plan change and needs Damian's decision; or (b) Codex,
  which Damian already has: Codex accepts remote MCP with a bearer token or OAuth, so the same /mcp works from Codex, but that is not a ChatGPT
  chat. Making `ask_claude_code` look read-only to bypass the limit is rejected: it would be a false annotation.

## Render changes (exact) and rollback
All through `python3 admin/bus-admin.py chatgpt <step>` (reads the Render API key from Keychain by reference; never prints a secret):
| Step | Render change | Redeploy |
|---|---|---|
| `plan` | none (read-only) | no |
| `stage-secret` | `CHATGPT_OAUTH_SECRET` = 48 random bytes (urlsafe), also kept in Keychain `agent-bus-chatgpt-oauth-secret` | no |
| `activate` | `CHATGPT_MCP_ENABLED=1`, `OUTSIDE_ROUTES=muse>maryalice,chatgpt>claude-code` | yes, then checks PRM 200 and /mcp 401 |
| `rollback` | `CHATGPT_MCP_ENABLED=0`, `OUTSIDE_ROUTES=muse>maryalice` | yes, then checks both 404 |
| `revoke-tokens` | `CHATGPT_TOKEN_GENERATION` + 1 | yes |
| `cutoff chatgpt` / `restore chatgpt` | at once on the running relay, then `CHATGPT_MCP_ENABLED` 0/1 so it holds across restarts | yes |
Output of `plan` on 2026-10-18: CHATGPT_* all absent; OUTSIDE_ROUTES unset (code default muse>maryalice); Keychain secret absent.

Rollback levels: (1) `cutoff chatgpt`: seconds. (2) `chatgpt rollback`: connector off, route removed, every path 404.
(3) Code: `git revert <merge commit>` on main and push; Render redeploys the previous relay. (4) Bridge: the `refreshContext` change is
inert without `context-sources.json`; `mv ~/.agent-bus/claude-code/context-sources.json{,.off}` disables it with no restart.

## Merge coordination with Codex
- main is still d9df86c. This branch is d9df86c plus its own commits, so it merges as a fast-forward.
- Codex's uncommitted edits on main (server.js +3, bridge +16, .gitignore) apply cleanly on top of this branch (checked with
  `git apply --check`). Codex's server.js hook `require`s `welcomeiq/relay.cjs`, which is untracked. If Codex commits server.js without
  that file, the relay will fail to start on Render. Codex should commit both together, or neither.
- The bridge restart (needed for `refreshContext`) also loads Codex's inert WelcomeIQ hook. Agree the timing with Codex.
- Coordination note left at `ops/COORDINATION-chatgpt-connector.md` in the main checkout (new, untracked file; no Codex file edited).

## Evidence
- Offline tests (real server.js against a mock Cliq), 15/15 pass on 2026-10-18 12:50 EDT. They cover: the checklist metadata; 401 challenge for
  no and forged tokens; 4 hostile redirect URIs; iss on error redirects; invalid_target; PKCE plain refused; a stranger's approval ignored;
  Damian's approval → iss, state, wrong verifier, wrong resource, code reuse, client-bound rotating refresh, refresh reuse; initialize and
  tools/list with securitySchemes and an honest readOnlyHint; Origin; ask → claude-code → correlated reply, retry = duplicate with 1
  execution, idempotency conflict; recipient finance refused; secret refused; cutoff and restore; a token is useless under another secret;
  the connector is off (404) without the switch, without the secret, or with a short secret; the relay's own route check refuses without the
  OUTSIDE_ROUTES grant; the official MCP SDK client end to end.
- Live Claude Code path: `bus-send.js --as ops --to claude-code` correlation_id 0468bf4f-42f2-4d6c-8325-402a01f1fc0a,
  delivered_to_waiting_listener, answered by claude-code after 10 s with the WelcomeIQ status from the records, STATUS: COMPLETE.
- `~/.agent-bus/claude-code/`: CLAUDE.md, context-sources.json, copies of welcomeiq STATUS and HANDOFF (refreshed by hand at 12:54 EDT;
  they refresh automatically once the bridge runs the branch code).

## Remaining approvals for activation (in order)
0. Damian's in-app plan check (no cost): ChatGPT on the web → Settings → Apps (or Plugins) → Advanced → is "Developer mode" offered, and
   does "Add custom MCP server" (Create) appear? If not, choose between Business, Codex, or stopping.
1. `chatgpt stage-secret`: creates the dedicated secret (CLAUDE.md escalation rule 3).
2. Merge the branch to main (fast-forward), coordinated with Codex; Render deploys the code, which stays off.
3. `chatgpt activate`: turns it on and adds the chatgpt>claude-code route (security control / routing, rule 4).
4. Bridge restart at an agreed time with Codex.
5. Damian creates the custom MCP server in ChatGPT: URL `https://agent-bus-relay.onrender.com/mcp`, Authentication OAuth, and approves
   the sign-in by typing `approve chatgpt XXXX-XXXX` (the code shown on the page) in #agent-bus.
6. Acceptance: "Ask Claude Code for the status of the WelcomeIQ project." Check that the cgpt- id appears in #agent-bus (request from chatgpt,
   ack from claude-code); a retry gives duplicate=true; recipient finance is refused; /mcp with no token gives 401; cutoff, then restore.
