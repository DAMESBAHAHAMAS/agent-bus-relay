# Approved Projects
Damian adds and closes projects here. Sessions act within each scope under CLAUDE.md.

## Order 1: Cliq Hub (OpenClaw Migration and System Reliability)
- Approved: Damian, 2026-10-16, blanket approval for everything in scope. Coordinating session: session_01HBDNajgqH5Qvst4FgYWZnQ ("OpenClaw Migration").
- Spec: Notion "OpenClaw — Migration & System Reliability", Order 1, with Damian's amendments: #agent-bus stays the agent-to-agent channel; the acknowledgement handshake is re-tested, not rebuilt.
- Window: Oct 16-18, 2026. Actual completion: (pending) Days 1-3 done 2026-10-18 (evidence: ops/day3-verification-2026-10-17.md, ops/task-a-verification-2026-10-17.md). Notion write-back done 2026-10-18 (Problem 2: resolved with exceptions; Problem 1: implemented, 3-day Telegram acceptance test runs to Oct 21). Order 1 complete.
- Accepted risk: posts use Damian's own 66-scope Cliq token (DM exposure), accepted 2026-10-16.
- Channel type (Damian, 2026-10-17): invite-only organization channels, closed, because Cliq does not allow private channel creation for this account. Damian is a member; only invited members can join or read.
- In scope: create the seven oc- channels (oc-business-operations, oc-finance, oc-sales-marketing, oc-systems-automation, oc-compliance-filings, oc-command, oc-alerts), Damian a member of each; post and pin a three-line charter in each function channel as Damian, from CANON and AGENTS.md only; relay v7+ and OC_CHANNELS / OC_ALERTS_CHAT on Render; pull and restart the bridge; switch remote control from Terminal to the launchd service; Day 3 tests; after they pass, remove the five function agents' Telegram topic bindings (back up first; Mary-Alice's Telegram stays); Notion write-back for Problems 1 and 2. Added to Day 3 by Damian, 2026-10-17: instant delivery in the oc- channels (relay `/cliq/oc-hint` push endpoint, Agent Bus bot participation handler, bot added to the six agent oc- channels).
- Out of scope: archiving or deleting any channel or message; any change to Muse's or GPT's access; anything touching Personal.

## WelcomeIQ Coval Specialist
- Approved: Damian, 2026-10-18 ("approve" to the proposed entry). Owner: the Claude Code session accountable for WelcomeIQ (Codex works only on Mary-Alice).
- Scope: `welcomeiq/` in this repo; the coval-welcomeiq OpenClaw agent and its Slack channel (#welcomeiq-coval-testing); Coval runs on "My agent" (no cost limit); branches and pull requests on damianknowles/omnichannel-voice-intake (never merge to `feature/streaming-pipeline` or deploy without Arsalan or Damian).
- Out of scope: Mary-Alice, HumanIQ/Muse, other OpenClaw agents.
- Record: welcomeiq/HANDOFF-claude-2026-10-18.md.
