# Cliq ↔ Claude Code integration: development evidence, 2026-10-20

Approved by Damian on 2026-10-20 for controlled development on branch `feature/cliq-claude-code`. No merge, deploy, or production change.
Coordinated with the MCP Authentication Audit thread: no file overlap. Its findings are adopted: the Zia write tool is excluded, the allowlist names individual tools, and tool output is treated as untrusted.

## Requirement 2: ChatGPT read path. Built and tested on this branch.
- `chatgpt/channel-classes.json`: every live Cliq channel, keyed by chat id. Readable classes: `project`, `function-execution`.
  - Readable: the five business-function `oc-` channels, `#oc-senior-projects-manager`, `#welcomeiq-testing`.
  - Never readable: Mary-Alice, Muse, Codex, assistant, `#agent-bus`, alerts, desk, test, `#finance-reports`. Unclassified channels are never readable either.
- `chatgpt/connector.js`: new `read_channel` tool, read-only (readOnlyHint), shown only when at least one approved channel is configured.
  - A channel is readable only if its class is readable AND its chat id is listed in the relay setting `CHATGPT_READ_CHANNELS`. A listed channel with a non-readable class is rejected and audited.
  - Secrets and identity numbers are withheld (the relay's outside-agent filter).
  - At most one Cliq read per channel per 30 s, plus the per-agent rate limit. Every read is audited.
- Test: `node --test chatgpt/test/` gives **22/22 pass**, including the new test against the real relay (server.js) with mock Cliq:
  - only `ocsystemsautomation` is listed, even though `occommand`, `agentbus` and an unclassified id were configured;
  - messages come back oldest first, `since` works, and a secret is withheld;
  - `occommand`, `agentbus`, `muse`, `assistant` and unknown channels are refused;
  - nothing is posted to any channel.

## Requirement 1: Cliq → full Claude Code. Verified pieces; executor change BLOCKED.
Live checks on this Mac, all read-only or in scratch folders:

| Check | Result |
|---|---|
| Account and plan for headless runs | `claude auth status`: claude.ai login, damian@damianmaknowles.com, **subscriptionType max** (not Pro; this answers register #129 for this Mac) |
| Connector names in headless runs | Same as interactive: `mcp__claude_ai_<connector>__<tool>`, loaded through ToolSearch |
| Zoho Projects connector auth (headless, cliq settings) | `get_portals` succeeded: 1 portal, `damianknowles` (653988524) |
| WorkDrive connector auth (headless) | `File_Property` succeeded (authenticated response) |
| WorkDrive write refused | `Create_Folder` → permission_denials, never reached Zoho |
| Zia write tool | `ask_senior_projects_manager` is denied and hidden: the run reported "no tool by that name" |
| `.env` read refused | `Read .env` → permission_denials |
| Push to main refused | `git push origin main` → permission_denials; test remote has no commits |
| Session continuity | Run 1 `--session-id`, run 2 `--resume` recalled the code word (same session id). The session file sits under the **real path** (`/private/tmp/...`), so the executor must resolve the folder's real path |
| Task gate | `task_check.py`: an open task in the fence → ok/open; missing task or mismatched project → `task_not_found_or_unreadable` |

- `chatgpt/executor-cliq-settings.json`: the allowlist names individual read-only Zoho Projects and WorkDrive tools. The deny list keeps every existing executor rule, and adds the Zia gateway tools plus the Claude credential files.
- **Blocked:** writing the Cliq profile into `chatgpt/executor.js` was refused by Claude Code's auto-mode permission check ("Create Unsafe Agents"). The bridge change depends on it and was not written. Not tested: a closed-task refusal (no closed task id was at hand).

## Production approvals still required
1. Permission for a Claude Code session to write the executor and bridge Cliq profile. Alternatively, Damian writes or reviews it himself.
2. Create `#oc-claude-code` and add `claude-code` to `OC_CHANNELS` on the relay (Render).
3. Set `CHATGPT_READ_CHANNELS` on the relay to the approved chat ids, then merge and deploy (Render deploys from main).
4. Create the switch file `~/.agent-bus/cliq-exec.on` (unattended execution) and restart the bridge on the merged code.
5. Add the Agent Bus bot to `#oc-claude-code` for instant pickup.
6. Pending in the Notion register: the single Zia write path; any MCP_SERVER_API_KEY rotation must be coordinated with this work.
