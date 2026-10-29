# Executive AI Operations Dashboard: MVP clock and infrastructure

The 48-hour clock starts when the merge AND all required infrastructure access are verified (Damian, 29 Oct 2026).

## Status: CLOCK RUNNING

- **Start:** 2026-10-29T17:55:31Z (13:55 ET), at the first verified push to the new repo (`ba339cf` on main).
- **Deadline:** 2026-10-31T17:55:31Z (13:55 ET, Friday 31 Oct).
- **Blockers:** none open.

| Item | Status | Evidence |
|---|---|---|
| Approved-projects entry (PR #11) | Done | Merged 2026-10-29 as aa6c87e on Damian's instruction; no required checks configured on the repo |
| Supabase project, free tier | Done | `executive-operations-dashboard`, ref hjycuzfhjokccpygvpvo, us-east-1, ACTIVE_HEALTHY, created 2026-10-29T17:09:11Z; org damianknowles is on the free plan; no upgrade made |
| Private repo `executive-operations-dashboard` | Done | Created by Damian after the App's create call was refused (403); attached to the session; push verified 2026-10-29T17:55:31Z, commit ba339cf |
| Render | Checked, nothing changed | Workspace "Damian's workspace" (tea-d6iool450q8c73ba8rag), 9 services. No existing dashboard backend; agent-bus-relay (srv-db72dfs9v7es73a8gh5g) is the production bus and is left alone |

## To unblock
1. Damian creates the private repo `DAMESBAHAHAMAS/executive-operations-dashboard` on GitHub (empty is fine) and gives the Claude GitHub App access to it.
2. Claude Code attaches it to the session and verifies a push. The clock starts at that verified push; start and deadline get recorded here.

## Plan once unblocked (no new approvals needed; technical notes)
- Backend: a new Render web service on Render's free instance type, deployed from the new repo, so the production bus is never redeployed or restarted for the dashboard. Free instances sleep when idle (cold start ~1 min); a paid instance would need Damian's approval.
- Supabase free tier allows 2 active projects; this project and llc-filing-intake are the 2. Restoring a paused project (truefare, omnichannel-voice-intake) would hit that limit.
- Nine Command View panels, read-only; approve, decline and "Send via Cliq" are not built in phase 1.
