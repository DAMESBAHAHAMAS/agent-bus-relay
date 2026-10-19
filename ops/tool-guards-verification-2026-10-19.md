# OpenClaw tool guards, 2026-10-19

Damian's rule (18 Oct): only Finance writes to the financial ledger. Everything else was his deferral to Claude Code.

## 1. Own-function writes only
- Config (live 18 Oct 21:03Z): each of bizops, finance, salesmkt, systems, compliance, codedev keeps its own `<fn>_direct_write` and loses the other five. Reads stay cross-function. Backup `~/.openclaw/backups/openclaw.json.pre-own-writes-20261018T210249Z`.
- Code guard in `~/.openclaw/extensions/business-functions-direct/index.js`: write and validate tools register only for, and execute only for, their owning agent ("Only <fn> may write to its own systems"). Backup `index.js.bak-pre-own-writes-20261018T210249Z`. Loaded by the gateway restart at 2026-10-19 02:18Z (Telegram default, Telegram business, WhatsApp reconnected).
- Verified: bizops sees only bizops_direct_write/validate; finance sees only finance_direct_write/validate. finance_direct_validate: PASS (books_contact_update on test contact 2107587000012371007, exact read-back).

## 2. Native Claude CLI tools
- Finding: the six business agents run on `claude-cli/claude-sonnet-5-5`. With no `tools.exec` setting, OpenClaw treats exec security as "full" and starts the Claude CLI with bypassPermissions, so the CLI's own tools (Bash, Read, Write, Edit, WebFetch) ran despite the OpenClaw deny list. Proof: bizops ran `echo harness-check` and returned `harness-check`.
- Fix: `agents.entries.<fn>.tools.exec.mode = "deny"` for the six business agents (Mary-Alice unchanged). Backup `~/.openclaw/backups/openclaw.json.pre-exec-deny-20261019T022054Z`. Hot-applied, config valid.
- Verified: bizops Bash and Read both refused, "PreToolUse hook error: OpenClaw exec policy denied native tool use (security=deny, ask=off)". bizops_direct_read still works (8 projects). Bus: claude-code -> finance 960178bf-6fae-4a5e-84cd-2b9d13a07204 answered in 8 s.

## Flags (not changed)
- `inbox-operations` (a Cowork skill, not OpenClaw) still writes Finance's spending sheet. It was grandfathered in CANON (Violation 1); under Damian's rule it moves to Finance when the Finance Agent takes it over.
- Systems' `tables_cell_update` reaches the Bank Feed tables, where Finance owns the data (R-0113). Those tables mirror Books; they are not the ledger.
- Mary-Alice (main) still inherits the global "full" profile, including native exec and web. That is by design for her role.

## Rollback
    cp -p ~/.openclaw/backups/openclaw.json.pre-own-writes-20261018T210249Z ~/.openclaw/openclaw.json   # before both config changes
    cp -p ~/.openclaw/extensions/business-functions-direct/index.js.bak-pre-own-writes-20261018T210249Z ~/.openclaw/extensions/business-functions-direct/index.js
    openclaw config validate && launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

## Follow-up checks (2026-10-19, requested by the coordinating session)
- Bash `echo harness-check` refused for all five others (session key diag-harness4), each with "PreToolUse:Bash hook error: OpenClaw exec policy denied native tool use (security=deny, ask=off)": finance, salesmkt, systems, compliance, codedev.
- bizops_direct_validate: PASS (project_task_update with exact read-back on test task 1156860000009398021).
- Bus, one request to each of the six, all acknowledged: bizops ff337916 (6 s), finance f052f468 (4 s), salesmkt fc613171 (7 s), systems b68aaee7 (9 s), compliance 69f1fb15 (9 s), codedev b51036d8 (8 s).
- bizops calling finance_direct_write cannot be attempted: the tool is no longer exposed to bizops. The index.js guard is the backstop if it is ever re-added.
