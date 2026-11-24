# Client Liaison

Damian's AI assistant for one approved customer at a time, on WhatsApp. It helps the customer finish the tasks on their own Zoho Projects project, and nothing else. Spec: Claude Doc "Customer Agent on Approved WhatsApp Channels: Spec", approved by Damian on 24 Nov 2026.

## Status
Built up to the WhatsApp channel step. Every outside system call refuses (`NOT_WIRED`) until the channel step, so nothing here can reach a customer, Zoho or Cliq yet. Tests: `npm test` (22 checks). Rehearsal: `npm run rehearse`.

## How A Message Flows
1. Zoho Desk's WhatsApp channel fires the `IM_Message_Add` webhook. `lib/desk-event.mjs` reads it and refuses anything that doesn't match Zoho's documented fields.
2. `lib/approval.mjs` lets it through only if the client line is set, the message came in on that Desk channel, the number matches a CRM contact exactly, and that contact has Agent Channel Approved ticked, a project ID, and no pause. Everything else stays in Desk for Damian.
3. A first message gets one welcome asking the customer to reply YES. Nothing else happens until they do.
4. `lib/classify.mjs` sends money, scope, deadline, complaint, legal, other-customer, password and injected-instruction messages straight to Damian, with a short holding reply.
5. Otherwise the agent is woken with a session token. The token fixes the customer, the number and the project; the agent never chooses them.
6. The agent's five tools (`lib/tools.mjs`, exposed by `openclaw/index.js`): list open tasks, comment on a task, save a file to a task, reply, ask Damian.
7. Every reply passes `lib/outbound-guard.mjs` (no money, credentials, card or ID numbers, phone numbers, unlisted links, or claiming to be Damian) and `lib/hours.mjs` (weekdays 10:00 to 16:00 in the customer's time zone, never Saturday or a closed date, a 3-minute reply grace except Friday). A blocked reply is never sent; Damian gets a Cliq card.
8. Complete a task, change a due date, add a task, or a message outside WhatsApp's 24-hour window: a Cliq card to Damian with Approve and Decline (`lib/escalation.mjs`).

## Usage And Billing
`lib/usage.mjs` counts per customer, per month: messages in and out, task updates, files saved, escalations. No message text is stored; the Desk conversation is the transcript. Weights per kind are in the config. With Damian's rate set, it drafts a Zoho Books invoice body (AI assistant service, plus WhatsApp messaging passed through) for his review, and tracks prepaid credit. It never sends an invoice. Until the rate is set it refuses to draft.

## Weekly Audit
`lib/audit.mjs` checks the record: every action inside the approved project, every reply to the approved number, every reply passed the guard, and the Desk transcript's outbound text re-checked. Any finding pauses that customer's agent until Damian reviews it.

## What Waits For The Channel Step
These need Damian's yes, because each one touches a live system, a credential or a security control:

| Step | Who | What |
|---|---|---|
| Pick the client line | Damian | His main WhatsApp number or his Zoho Voice business number. Goes in `client_line`. |
| Connect WhatsApp in Zoho Desk | Damian | Setup, Channels, Instant Messaging, WhatsApp. Meta sign-in and the verification call. Gives `desk_channel_id`. |
| Create the CRM fields | Session, on his yes | The seven fields in `crm/fields.md`, on Contacts. |
| Wire the adapters | Session, on his yes | `~/.customer-liaison/adapters.mjs` on the Mac: CRM lookup, Projects tasks and comments, Desk reply, Cliq post, reading credentials from Keychain by reference. |
| Receive the webhook | Session, on his yes | A route for the Desk webhook on the relay (Render), which then wakes `client-liaison` through the bridge. This changes routing, so it waits for him. |
| Add the agent to OpenClaw | Session, on his yes | `openclaw/client-liaison.patch.json` (dry run first), the plugin into `~/.openclaw/extensions/customer-liaison`, `agent/AGENTS.md` into the agent's workspace. Runs on his own plan, as he decided. |
| Help sheet links | Damian | His Lovable affiliate link, Claude referral link and the GoDaddy delegate-access steps, each checked by him. |
| Set the rate | Damian | `usage.rate_per_unit` and the WhatsApp pass-through rate. |

## Files
- `lib/` the code; `test/` the checks; `rehearsal/run.mjs` a scripted conversation with stand-in systems
- `agent/AGENTS.md` the agent's instructions; `agent/help-sheet.md` the only how-to answers it may give
- `openclaw/` the plugin and the config patch (not applied)
- `crm/fields.md` the CRM fields (not created)
- `config.example.json` copy to `~/.customer-liaison/config.json`; no secrets in it
