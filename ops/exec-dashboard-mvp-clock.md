# Executive AI Operations Dashboard: MVP clock and infrastructure

The 48-hour clock starts when the merge AND all required infrastructure access are verified (Damian, 29 Oct 2026).

## Status: CLOCK RUNNING — MVP live, signed in by Damian 2026-10-30

- **Start:** 2026-10-29T17:55:31Z (13:55 ET), at the first verified push to the new repo (`ba339cf` on main).
- **Deadline:** 2026-10-31T17:55:31Z (13:55 ET, Friday 31 Oct).
- **Blockers:** none open.

| Item | Status | Evidence |
|---|---|---|
| Approved-projects entry (PR #11) | Done | Merged 2026-10-29 as aa6c87e on Damian's instruction; no required checks configured on the repo |
| Supabase project, free tier | Done | `executive-operations-dashboard`, ref hjycuzfhjokccpygvpvo, us-east-1, ACTIVE_HEALTHY, created 2026-10-29T17:09:11Z; org damianknowles is on the free plan; no upgrade made |
| Private repo `executive-operations-dashboard` | Done | Created by Damian after the App's create call was refused (403); attached to the session; push verified 2026-10-29T17:55:31Z, commit ba339cf |
| Web app (nine panels) | Done | Commit 3c57bb4 in executive-operations-dashboard: web/ static app, read-only, owner-only sign-in; smoke-tested in Chromium with mock data (nine panels render, filters work, HTML escaped, no page errors) |
| Mac collector | Running | launchd com.damianknowles.eod-collector on Damian's Mac. First good cycle 2026-10-29T18:52:21Z: `synced 15 agents, 78 runs, 87 messages, 0 open exceptions`. Supabase source_status bridge and relay last_ok_at 18:55:50Z. Fix 38ce76a (PGRST102, one batch per key set) |
| Decision register data | Loaded (snapshot) | 193 open rows (Submitted/Under Review, Function not Other, no [TRACKING]-style rows) from Notion collection bfa1953e into Supabase `decisions`; 193 distinct links verified. Panel shows the 15 most urgent (commit e4c328b) |
| Zoho Projects data | Live | collector/zoho.js (6cbc51b): open tasks every 10 min, GET only, Personal excluded, agents' existing server-based client in ~/.zoho/projects.env by reference. First live sync 2026-10-30T04:26:19Z: 446 open tasks, 52 milestones, 3.6 s. Milestones are derived from open tasks because the client has no milestone scope (adding it is a credential change for Damian to decide) |
| Render Static Site | Done | Created by Damian in the dashboard 2026-10-29T18:40:51Z: srv-dbhp6cg473hc73ail260, https://executive-operations-dashboard-29wr.onrender.com, build `echo static`, publish `web`, branch main, auto-deploy on commit. Deploy dep-dbhp6co473hc73ail2t0 live 18:41:06Z on 3037cc1 |
| Render | Checked, nothing changed | Workspace "Damian's workspace" (tea-d6iool450q8c73ba8rag), 9 services. No existing dashboard backend; agent-bus-relay (srv-db72dfs9v7es73a8gh5g) is the production bus and is left alone |

## Blockers and incidents
- ~~B1~~ cleared 18:40Z: Render can deploy the repo.
- ~~B3~~ cleared 18:52Z: secret key `collector` stored in Keychain; collector syncing.
- ~~B2~~ cleared 2026-10-30 ~04:09Z: Supabase Auth Site URL and Redirect URL set to the -29wr address; Damian signed in and saw live data.
- Sign-in email: Supabase's built-in mailer delivered one link (19:01Z), then a second (19:09Z) that never reached Damian's inbox, after which it refused the address as `email_address_invalid` (02:48Z, 04:01Z). Fixed by custom SMTP through Damian's own Zoho Mail (smtppro.zoho.com:465, sender damian@damianknowles.com), set by Damian in the Supabase dashboard.
- Collector stall: the long-running collector process failed every cycle with `fetch failed` from 19:15Z to 04:13Z while a fresh process on the same Mac reached Supabase and the relay. Fix 9bdc6a7: log the network cause, exit after 5 failed cycles so launchd restarts it; dashboard now raises a "collector not reporting" exception and marks agents stale after 15 min. Restarted 04:14:31Z: `synced 15 agents`.

## Plan once unblocked (no new approvals needed; technical notes)
- Hosting: a free Render Static Site (no server, no sleep), deployed from the new repo, so the production bus is never redeployed or restarted for the dashboard. Data is written by a Mac collector to Supabase with the service key held in Keychain (`exec-dashboard-supabase-service`).
- Supabase free tier allows 2 active projects; this project and llc-filing-intake are the 2. Restoring a paused project (truefare, omnichannel-voice-intake) would hit that limit.
- Nine Command View panels, read-only; approve, decline and "Send via Cliq" are not built in phase 1.
