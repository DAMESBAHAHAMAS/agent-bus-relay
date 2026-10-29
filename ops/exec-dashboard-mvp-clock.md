# Executive AI Operations Dashboard: MVP clock and infrastructure

The 48-hour clock starts when the merge AND all required infrastructure access are verified (Damian, 29 Oct 2026).

## Status: CLOCK RUNNING

- **Start:** 2026-10-29T17:55:31Z (13:55 ET), at the first verified push to the new repo (`ba339cf` on main).
- **Deadline:** 2026-10-31T17:55:31Z (13:55 ET, Friday 31 Oct).
- **Blockers:** 1 open (B1 below). Neither blocker stops the clock.

| Item | Status | Evidence |
|---|---|---|
| Approved-projects entry (PR #11) | Done | Merged 2026-10-29 as aa6c87e on Damian's instruction; no required checks configured on the repo |
| Supabase project, free tier | Done | `executive-operations-dashboard`, ref hjycuzfhjokccpygvpvo, us-east-1, ACTIVE_HEALTHY, created 2026-10-29T17:09:11Z; org damianknowles is on the free plan; no upgrade made |
| Private repo `executive-operations-dashboard` | Done | Created by Damian after the App's create call was refused (403); attached to the session; push verified 2026-10-29T17:55:31Z, commit ba339cf |
| Web app (nine panels) | Done | Commit 3c57bb4 in executive-operations-dashboard: web/ static app, read-only, owner-only sign-in; smoke-tested in Chromium with mock data (nine panels render, filters work, HTML escaped, no page errors) |
| Render Static Site | **Blocked (B1)** | 2026-10-29 ~18:20Z: create_static_site returned 400 "repository URL is invalid or unfetchable" for DAMESBAHAHAMAS/executive-operations-dashboard. Render's GitHub App cannot see the new private repo |
| Render | Checked, nothing changed | Workspace "Damian's workspace" (tea-d6iool450q8c73ba8rag), 9 services. No existing dashboard backend; agent-bus-relay (srv-db72dfs9v7es73a8gh5g) is the production bus and is left alone |

## Open blockers
- **B1 (Damian, ~1 min):** GitHub, Settings, Applications, Render, Configure, Repository access: add `executive-operations-dashboard`. Then Claude creates the free Static Site (publish dir `web`).
- **B2 (Damian, after B1):** Supabase dashboard, Authentication, URL Configuration: set Site URL and add a Redirect URL to the Render site's URL, so the sign-in email link returns to the dashboard.

## Plan once unblocked (no new approvals needed; technical notes)
- Hosting: a free Render Static Site (no server, no sleep), deployed from the new repo, so the production bus is never redeployed or restarted for the dashboard. Data is written by a Mac collector to Supabase with the service key held in Keychain (`exec-dashboard-supabase-service`).
- Supabase free tier allows 2 active projects; this project and llc-filing-intake are the 2. Restoring a paused project (truefare, omnichannel-voice-intake) would hit that limit.
- Nine Command View panels, read-only; approve, decline and "Send via Cliq" are not built in phase 1.
