# Executive AI Operations Dashboard: MVP clock and infrastructure

The 48-hour clock starts when the merge AND all required infrastructure access are verified (Damian, 29 Oct 2026).

## Status: CLOCK RUNNING

- **Start:** 2026-10-29T17:55:31Z (13:55 ET), at the first verified push to the new repo (`ba339cf` on main).
- **Deadline:** 2026-10-31T17:55:31Z (13:55 ET, Friday 31 Oct).
- **Blockers:** 2 open (B2, B3 below), both owner steps. Neither stops the clock.

| Item | Status | Evidence |
|---|---|---|
| Approved-projects entry (PR #11) | Done | Merged 2026-10-29 as aa6c87e on Damian's instruction; no required checks configured on the repo |
| Supabase project, free tier | Done | `executive-operations-dashboard`, ref hjycuzfhjokccpygvpvo, us-east-1, ACTIVE_HEALTHY, created 2026-10-29T17:09:11Z; org damianknowles is on the free plan; no upgrade made |
| Private repo `executive-operations-dashboard` | Done | Created by Damian after the App's create call was refused (403); attached to the session; push verified 2026-10-29T17:55:31Z, commit ba339cf |
| Web app (nine panels) | Done | Commit 3c57bb4 in executive-operations-dashboard: web/ static app, read-only, owner-only sign-in; smoke-tested in Chromium with mock data (nine panels render, filters work, HTML escaped, no page errors) |
| Mac collector | Built, not yet installed | Commit ab69602: collector/collect.js (bus messages, bridge runs, exceptions, source status), parser tests pass, launchd installer collector/install.sh. Waits on B3 |
| Decision register data | Loaded (snapshot) | 193 open rows (Submitted/Under Review, Function not Other, no [TRACKING]-style rows) from Notion collection bfa1953e into Supabase `decisions`; 193 distinct links verified. Panel shows the 15 most urgent (commit e4c328b) |
| Zoho Projects data | Count snapshot | 446 open tasks, 52 open milestones across 10 business projects (Personal excluded), portal 653988524. Per-task rows and milestone dates need the collector's Zoho sync (next) |
| Render Static Site | Done | Created by Damian in the dashboard 2026-10-29T18:40:51Z: srv-dbhp6cg473hc73ail260, https://executive-operations-dashboard-29wr.onrender.com, build `echo static`, publish `web`, branch main, auto-deploy on commit. Deploy dep-dbhp6co473hc73ail2t0 live 18:41:06Z on 3037cc1 |
| Render | Checked, nothing changed | Workspace "Damian's workspace" (tea-d6iool450q8c73ba8rag), 9 services. No existing dashboard backend; agent-bus-relay (srv-db72dfs9v7es73a8gh5g) is the production bus and is left alone |

## Open blockers
- ~~B1~~ cleared 18:40Z: Render can deploy the repo.
- **B3 (Damian, ~2 min):** store the Supabase secret key (`sb_secret_…`, Project Settings, API Keys) in Keychain as `exec-dashboard-supabase-service`; then the local session runs `collector/install.sh`.
- **B2 (Damian):** Supabase Auth URL Configuration must use the real URL `https://executive-operations-dashboard-29wr.onrender.com` (Render added the -29wr suffix) for Site URL and Redirect URLs.

## Plan once unblocked (no new approvals needed; technical notes)
- Hosting: a free Render Static Site (no server, no sleep), deployed from the new repo, so the production bus is never redeployed or restarted for the dashboard. Data is written by a Mac collector to Supabase with the service key held in Keychain (`exec-dashboard-supabase-service`).
- Supabase free tier allows 2 active projects; this project and llc-filing-intake are the 2. Restoring a paused project (truefare, omnichannel-voice-intake) would hit that limit.
- Nine Command View panels, read-only; approve, decline and "Send via Cliq" are not built in phase 1.
