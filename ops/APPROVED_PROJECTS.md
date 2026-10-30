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

## Finance Autonomy
- Approved: Damian, 2026-10-19. Trigger: Finance Desktop's Phase 1 requirements, delivered to claude-code and Systems & Automation over the bus or Cliq.
- In scope: implement, configure, test and correct every listed capability for OpenClaw Finance (`finance`) in Zoho Books, Tables, WorkDrive, Projects and Cliq, until it runs the Aug 12, 2026-present reconciliation and the 4:00 AM and 4:00 PM close reports on its own, proven by real operations. Acknowledge on the bus; Damian does not relay messages.
- Out of scope: Zoho Mail, Zoho Flow, the mail filters, deletions, new expenses.
- Record: until 2026-10-30 this entry existed only as an uncommitted edit on the Mac; Damian reaffirmed it ("Finance Autonomy is still approved, add it back") and it was committed that day.

## Executive AI Operations Dashboard
- Approved: Damian, 2026-10-29 (authorized in his session with Claude Code; in force when Damian merges this entry). Owner: the Claude Code session building the dashboard; Systems & Automation for agent instrumentation; Business Operations validates task ids.
- Spec: the five capabilities Damian set on 29 Oct (agent monitoring; projects and tasks; exceptions and alerts; execution evidence; decisions and approvals), run by management by exception. Build plan: Claude doc "Executive AI Operations Dashboard — Build Plan" (https://claude.ai/artifact/UCA7vNoWnNMgfvMko1NtSn). Design: the mockup Damian approved on 28 Oct (Design canvas "Executive AI Operations Dashboard"). Decisions of 28 Oct apply: custom dashboard, the existing Render backend, a Supabase reporting cache, LangSmith tracing with the Zoho Projects task id as trace metadata, Zoho Projects the sole authority for task status, daily spend budget unlimited.
- Goal: a working read-only MVP of all five capabilities, including the visible agent communication feed Damian asked for in the mockup on 28 Oct, within 48 hours of this entry's merge; then the phases in the build plan, each closed by its gate test with evidence ids. Write operations, approvals and hardening are deferred (Damian, 28 Oct); access stays limited to Damian behind authentication meanwhile.
- In scope:
  - the dashboard web app built from the approved mockup, behind authentication, for Damian only, with a read-only agent communication feed from #agent-bus and the oc- channels (Personal excluded);
  - read-only collection on the existing Render backend from the bridge log, the relay ledger, status and audit (agent keys read by reference), Claude CLI run output, LangSmith traces, Zoho Projects and the Notion decision register;
  - a Supabase reporting cache: create its tables and write run, task and exception rows;
  - per-run records and LangSmith tracing with `zoho_task_id` and `thread_id` in the bridge, through reviewed pull requests in this repo; secret-shaped text blacked out; prompt and reply bodies not stored;
  - Cliq alerts to oc-alerts (bridge crash, withheld reply, request unacknowledged over 30 minutes, stalled task);
  - branches, pull requests, merges to main, deploys of these changes, bridge restarts they need, and their tests.
- Out of scope (escalate to Damian first): any write to Zoho Projects, the decision register or Cliq beyond oc-alerts; approve and reject actions (capability 5 stays view-only until Damian approves the write phase, and any approval it sends must be Damian's own Cliq message under R-0117 / ADR-212); creating, rotating or copying any credential, including the LangSmith API key and the Supabase service key; new paid plans; OpenClaw permission changes, including enforcing the own-tools rule; any Personal (DK-154) data; exposing the dashboard without authentication; anything that interrupts video production or the Finance Plaid backfill.
- Rules: agents never assign a task id; Business Operations validates it in Zoho Projects (exists, right project, agent authorized) before dispatch, and an invalid id blocks dispatch and raises an exception.
- Record: evidence for each phase gate under ops/ (pull request, deploy and test run ids).
