# ChatGPT ↔ Claude Code connector: handoff record

Project owner: Damian. Assigned 2026-10-18 to a separate Claude Code session. Branch `chatgpt-claude-connector`
(worktree `~/Developer/agent-bus-relay-chatgpt`). This file is the resume point: read it first, do not repeat discovery.

## State as of 2026-10-18
| Stage | State |
|---|---|
| A. Discovery | DONE (below) |
| B. Interface | DONE on branch, offline tests 9/9 pass. NOT deployed. |
| C. Authentication | DONE on branch (OAuth 2.1 + PKCE, approval by Damian in Cliq). NOT live. |
| Claude Code side | LIVE: `~/.agent-bus/claude-code/` has read-only project context; live bus test answered (below). |
| D. End-to-end with real ChatGPT | NOT DONE. Blocked on Damian's approvals 1-4 below. |

## Discovery findings
- The relay (`server.js`, Render `agent-bus-relay`, public HTTPS) is the only door to `#agent-bus`. Identity comes from a service key, never
  from the body. Every message is an HMAC-signed envelope in Cliq (permanent audit), with correlation ids and an ack ledger (`/status`).
- Outside agents (`EXTERNAL_AGENTS`) may reach only `FRONT_DOOR` (bizops) plus `OUTSIDE_ROUTES`. The bridge frames their text as untrusted data.
- `claude-code` is already a bus agent. The Mac bridge wakes it as `claude -p --tools "" --strict-mcp-config` (no tools, no MCP),
  cwd `~/.agent-bus/claude-code`, which was empty, so it knew nothing about any project.
- `gpt` on the bus is an OpenClaw agent, not ChatGPT. Codex's `welcomeiq/chatgpt.mjs` (uncommitted on main) is a different, unactivated
  ChatGPT→Codex adapter that needs an external OAuth issuer that does not exist. This work does not touch it.
- ChatGPT: per OpenAI's Plugins/Apps auth doc (developers.openai.com/plugins/build/auth), remote MCP servers accept OAuth 2.1 with PKCE S256
  (DCR or CIMD), or no auth. ChatGPT cannot send static API keys. No auth would be a public unauthenticated endpoint, so OAuth is required.
  Custom GPT Actions do accept bearer API keys, but OpenAI is retiring custom GPTs, so that path is not used.
- In non-interactive `claude -p`, CLAUDE.md `@imports` of files outside the cwd (and symlinks to them) are NOT loaded; files inside it are.

## Architecture (shortest supported path, no new service)
```
ChatGPT (developer-mode app / MCP connector)
  -> POST https://agent-bus-relay.onrender.com/mcp      OAuth bearer, scope claude.ask
  -> relay posts a signed request: from "chatgpt" (OUTSIDE agent) to "claude-code", correlation_id cgpt-<hash of idempotency key>
  -> Mac bridge wakes claude-code (no tools) with read-only project copies
  -> claude-code's own reply is posted on the bus
  -> relay wakes the waiting MCP call, or ChatGPT polls get_claude_code_response
```
Files: `chatgpt/connector.js` (new), `server.js` (+5 lines), `bridge/bus-bridge.js` (+13 lines: `refreshContext`), `chatgpt/test/local.test.js`.

MCP tools:
- `ask_claude_code {message, idempotency_key, recipient=claude-code, wait_seconds<=45}` returns `{correlation_id, state, response, error,
  requested_at, responded_at, request_message_id, response_message_id, duplicate}`.
- `get_claude_code_response {correlation_id, wait_seconds}` returns the same.
- States: pending, answered, completed, blocked, failed (WAKE FAILED), escalated (no ack in 10 min).

## Controls
- AuthN: OAuth 2.1, PKCE S256 mandatory, DCR limited to https redirect URIs on chatgpt.com, single-use 5-minute codes, 1-hour access tokens,
  rotating 30-day refresh tokens, audience = the /mcp URL, RFC 9207 `iss` returned.
- Sign-in approval: the /oauth/authorize page shows a code. A token is issued only after `approve chatgpt <code>` is typed in #agent-bus from
  Damian's own Cliq account (DAMIAN_CLIQ_IDS). The Cliq alert to Damian never contains the code. At most 5 pending, 10-minute expiry.
- Keys: token MAC key = HMAC(BUS_SIGNING_SECRET, "chatgpt-oauth-v1"). No new secret. Revoke all: raise `CHATGPT_TOKEN_GENERATION`.
  Stop now: `python3 admin/bus-admin.py cutoff chatgpt`.
- AuthZ: one principal (damian). Recipients `CHATGPT_RECIPIENTS` (default claude-code) AND the relay's own `routeDenied` (needs
  `OUTSIDE_ROUTES` to contain `chatgpt>claude-code`). Outside class: no broadcast, no Damian authority, untrusted framing.
- Least privilege: two tools only. No shell, file or other agent access. claude-code keeps `--tools ""`.
- Replay/idempotency: correlation_id derived from the idempotency key. A retry returns the original. Same key with a different message
  returns `idempotency_conflict`. The bridge runs each agent+id at most once (its done-set).
- Limits: relay 20 posts/min per agent, `CHATGPT_MAX_PER_HOUR` (20), the loop guardrail, bridge `BUS_RUN_TIMEOUT_S` (300), tool wait ≤45s.
- Leakage: the relay's secret filter is applied to the message. Replies to an outside agent also pass the SSN/EIN/card filter.
- Audit: the request and reply are signed messages in #agent-bus. Relay audit events: chatgpt_signin_started/approved, chatgpt_token_issued,
  chatgpt_request, chatgpt_duplicate_suppressed, refused, unauthorized.
- Off by default: without `CHATGPT_MCP_ENABLED=1`, all new paths return 404 exactly as today.

## Evidence
- Offline (real server.js against a mock Cliq): `node --test chatgpt/test/` gives 9/9 pass: metadata; 401 with resource_metadata for no or
  forged token; foreign redirect refused; a stranger's approval ignored; Damian's approval completes OAuth; wrong PKCE verifier, code reuse
  and refresh reuse refused; initialize and tools/list; ask → claude-code → correlated reply; retry is a duplicate with exactly 1 execution;
  idempotency conflict; recipient finance refused; secret refused; cutoff gives 401 at once, restore gives 200.
- Live Claude Code path (2026-10-18): `bus-send.js --as ops --to claude-code` correlation_id 0468bf4f-42f2-4d6c-8325-402a01f1fc0a,
  delivered_to_waiting_listener, acknowledged by claude-code after 10 s with a correct WelcomeIQ status from the records, STATUS: COMPLETE.
- `~/.agent-bus/claude-code/`: CLAUDE.md (imports two local copies), context-sources.json (allowlist), welcomeiq-STATUS.md and
  welcomeiq-HANDOFF.md (snapshot copied 2026-10-18 ~12:17 EDT, until the bridge refresh is live).

## Needs Damian's approval (in order)
1. Deploy: merge `chatgpt-claude-connector` to main so Render deploys. This adds public routes /mcp, /oauth/*, /.well-known/oauth-*
   to the existing relay (inert until step 2).
2. Render env (routing/authority change): `CHATGPT_MCP_ENABLED=1`; `OUTSIDE_ROUTES=muse>maryalice,chatgpt>claude-code` (keep Muse's route).
3. Restart the bridge so `refreshContext` keeps the copies current (`launchctl kickstart -k gui/$(id -u)/com.damianknowles.agent-bus-bridge`).
   Note: the main checkout holds Codex's uncommitted, inert WelcomeIQ bridge hook. Coordinate the merge and restart with Codex.
4. In ChatGPT (Damian, his account): Settings → Apps/Plugins → Advanced → Developer mode on; Create app: name "Claude Code (agent bus)",
   URL `https://agent-bus-relay.onrender.com/mcp`, Authentication OAuth (dynamic registration). In the sign-in page, type the code it shows
   in #agent-bus as `approve chatgpt XXXX-XXXX`. Developer mode availability depends on the ChatGPT plan; confirm in the settings.
5. Optional, later: give claude-code read-only tools for a scoped folder so it can "execute work". This expands permissions and is NOT proposed now.

## Acceptance test (after 1-4)
In ChatGPT: "Ask Claude Code for the status of the WelcomeIQ project." Expect the tool call `ask_claude_code`, a `cgpt-…` correlation_id,
the same id in #agent-bus (request from chatgpt, ack from claude-code), and the answer. Then: retry with the same key (duplicate=true, no
second bus request); ask for recipient finance (recipient_not_allowed); call /mcp with no token (401); `cutoff chatgpt` (401), `restore`.
