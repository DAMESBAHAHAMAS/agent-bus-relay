# Handover inventory: desktop shadow agents to OpenClaw agents (2026-10-19)

Read-only. Nothing was cut over, started or switched off. This feeds the Order 3 "operations list" and the per-function harvest.
Sources: Zoho Projects (12 fenced projects, read with the existing read-only adapter), CANON `HANDOFFS.md`, `IN_FLIGHT.md` and `ORCHESTRATORS/`, the five `claude-<fn>` bus agents, and the 18 Oct tool inventory. Every open Zoho task is listed in `ops/handover-inventory-2026-10-19-tasks.md`.

## The linchpin: where each shadow's working knowledge actually lives
- **The bus `claude-<fn>` agents are not the desktop shadows.** All five replied the same day (bus ids 4ee2bba3, 9a443c75, 4ea571cc, e99c7d42, 9ce66093). Each is a stub: its `CLAUDE.md` under `~/.agent-bus/claude-<fn>/` holds only a placeholder ("paste this function's project instructions below"). It has no tools, no history, and an empty memory folder. None could list any open work, and each declined to invent any.
- **The desktop shadows' instructions and knowledge live in Damian's claude.ai Projects, not on this Mac.** The desktop app's local Cowork store holds 131 sessions, 93 of them in no project space. Only one space (BUSINESS_OPERATIONS) has a name, and its last activity was 26 Aug. Transcripts were not opened: reading session titles was blocked as personal-data handling, and the Personal wall applies.
- **So the "without missing a beat" handover needs one input per function that only Damian can export:** each desktop Project's custom instructions, its knowledge files, and its last few working threads. Those fill the stub `CLAUDE.md` files and the OpenClaw agents' workspaces.
- **IN_FLIGHT has no open claims.**

## Zoho Projects: open work by function
No open task has a due date, and every owner is "Unassigned User". Priority is the only ordering signal.

| Function | Project (id) | Open | High priority |
|---|---|---|---|
| bizops | Business Operations (1156860000009155003) | 60 | 11 |
| bizops | Inbox Execution Dashboard (1156860000009123003) | 111 | 31 |
| finance | FIN — Phase 1 (1156860000009156003) | 27 | 19 |
| finance | FIN — Phase 2 (1156860000009404074) | 1 | 1 |
| finance | FIN — Pipeline Documentation (1156860000009408009) | 11 | 4 |
| systems | Systems and Automation (1156860000009158003) | 108 | 24 |
| compliance | Compliance and Filings (1156860000009157037) | 27 | 12 |
| salesmkt | (none readable, see below) | ? | ? |
| unassigned | International Booking Platform (1156860000009303132) | 19 | 0 |

**Flag:** four fenced projects return HTTP 410 Gone: 1156860000009157003, 1156860000009287015, 1156860000009291018 and 1156860000009483007. By id order 1156860000009157003 is likely the Sales and Marketing project. The other three may be "Website Development", "Content Production", "Sales Pipeline" and "Campaign" from `policy.json project_names`. Sales and Marketing's Zoho work cannot be inventoried until these are found or restored. 410 usually means deleted or moved to trash.

## CANON open handoffs by function (`HANDOFFS.md`)
- **bizops (4 open):**
  - The Finance register still files the Sandra rent under Personal.
  - Five Finance source files are waiting to be filed. [VERIFY]
  - The 24-filter email pack is reference only.
  - DK-148 throughput is unproven. [VERIFY]
- **finance (8 open):**
  - Define Books invoice and payment controls for the LLC funnel (FIN-GX1).
  - The Anthropic credit email is drafted but unsent (Damian decides).
  - Rule on ledger writes that have no read-back.
  - FIN-5: the Anthropic budget figure.
  - Two failed bank tie-outs: Chime $101.04, and Cash App 16 rows vs 15.
  - The Financial Control Center trigger has fired.
  - Possible client filing documents in `RAW/`.
  - `inbox-operations` still writes the ledger (Violation 1). Ending that is Finance's first job.
  - Budget the 2190 SMS forwarding service.
- **salesmkt (10 open):**
  - Correct the AI-shopping-agent brief.
  - Ratify the nine-stage Deal Blueprint and triage the twelve deal ideas.
  - Show the DIY price as "$9 + state fees".
  - Put the new formation prices live ($139).
  - Build the Stage 1 eligibility gate (blocks CF-12).
  - Load the Square export into the CRM (56 records; blocks FIN-18).
  - Lead Outreach Agent: frozen design.
  - Verify the FAQ figures against Sunbiz.
  - Tidy SM M5 and define the knowledge-base hand-off.
- **systems (about 30 open; the largest backlog):**
  - SECURITY: six `self_client*.json` files hold live Zoho client secrets in plaintext.
  - Stripe DIY price $139.
  - Wire the funnel checkout to Stripe.
  - Inbox Control System delivery path and sender identity.
  - Finance ledger connector refused.
  - Drafting Engine (build order #1).
  - Revoke the Daniel Knowles OAuth grant.
  - Google Maps key exposed [VERIFY].
  - Filing-route holes.
  - Paid-Traffic Readiness items 9-13, 17 and 18.
  - SA4-T464/465/466 Gate 2 tasks.
  - Plus the rest of the → SYSTEMS AND AUTOMATION section.
- **compliance (7 open):**
  - Define the pre-payment filing preview (first 24-hour batch).
  - Offer wording, refund, terms and privacy pages (task 1156860000009412018).
  - CF-GX1 pre-payment PDF contents.
  - 1099-MISC for office rent (W-9 from Community Living LLC).
  - US status of the Bahamas charity.
  - Cash App 1099-K under a personal TIN.
  - Legal records have no filing route.
  - Two legal points before the eligibility gate ships.
- **Damian (6 open, not handed to any agent):**
  - The four funnel answers.
  - Authorize the Inbox Control build schedule.
  - Confirm no standing file-delete authority.
  - The two Librarian questions.
  - The missing 09-10 handoff [VERIFY].

## What each OpenClaw agent cannot yet do with its current tools (18 Oct inventory, plus today's guards)
| Agent | Can do now | Cannot yet do |
|---|---|---|
| bizops | Projects R/W, Desk R/W, Mail read + drafts, Calendar R/W, WorkDrive, Zoho Projects inventory | Send mail; Bookings (no scope); anything needing shell or files (native tools now denied) |
| finance | Books read; Books drafts and records; WorkDrive | Books banking, chart of accounts, invoices, journals and payments where scopes are missing (live 401/code 57); Stripe; read the ledger sheet (connector refused) |
| salesmkt | CRM R/W (Leads, Contacts, Accounts, Deals, Campaigns module, Tasks, Products); website read | Campaigns app, Social, SalesIQ (no scopes); its own Zoho project (410) |
| systems | CRM settings read + variable update, Zoho Tables R/W, Render read | Flow, Creator, Analytics (no scopes); building or deploying code (codedev holds repos and deploys) |
| compliance | WorkDrive and filing files | Zoho Sign (no scope); Zoho Projects writes (no project tools); anything outside WorkDrive |
| all six | Bus, sessions, own-function writes, cross-function reads | Shell, file and web tools (denied 19 Oct by design) |

## Ready-to-run next steps (in order)
1. **Damian exports each desktop function Project** (instructions, knowledge files, last working threads) and drops them in CANON `INBOX/`. This is the only blocking input.
2. **Find the four 410 projects,** Sales and Marketing first: check Zoho Projects trash and archive. Restore if they were archived by mistake. If they were retired, record that.
3. **Per-function harvest (Order 3):** fill each OpenClaw agent's workspace and the stub `claude-<fn>` `CLAUDE.md` from step 1. Then rerun this inventory and require each agent to list its own open work.
4. **Fresh Start (with GPT):** the open tasks here have no dates or owners. That is the baseline the Fresh Start matrix replaces.
5. **Highest risk to clear first:** the plaintext Zoho client secrets (systems handoff, from 17 Sep).
