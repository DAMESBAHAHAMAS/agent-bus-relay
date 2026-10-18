# Cliq channel inventory, 2026-10-16

Read-only listing made with the 66-scope Cliq token (Keychain item `zoho-central-candidate-cliq`) through `GET /api/v2/channels`, including archived channels. Every channel the account can see is listed: 7. The API returns none the account isn't a member of. DMs and bot chats are not listed or exported.

| Name | Unique name | Channel id | Level | Status | Members | Created | Last message | Messages | Class | Action |
|---|---|---|---|---|---|---|---|---|---|---|
| #agent-bus | agentbus | O2282830000002352001 | organization | created | Damian Knowles | 2026-10-13 | 2026-10-15 | 590 | Canonical bus | KEEP. Never archive (Damian's amendment). |
| #desk | desk | O2282830000000106025 | organization | created | Damian Knowles | 2020-11-01 | 2026-10-16 | 5581 | Other | Leave alone. Zoho Desk notification channel, high volume. |
| #finance-reports | financereports | O2282830000002304001 | organization | created | Damian Knowles; SeniorProjects | 2026-09-23 | 2026-09-23 | 0 | Other (possible finance function channel) | Leave alone. Empty, and no OpenClaw or relay binding points to it. |
| #assistant | assistant | O2282830000000207001 | organization | created | Damian Knowles | 2021-07-23 | 2021-07-23 | 1 | Other | Leave alone. Order-alert channel (Cliq alerts task). |
| #Ash | ext:ash | E3000012931017 | external | archived | Damian Knowles; Ashwinth | 2020-01-28 | 2020-01-28 | 4 | Other (external) | Leave alone. External channel, already archived. |
| #desk | deskj | O2282830000000015015 | organization | archived | Damian Knowles | 2018-07-19 | 2019-12-21 | 1044 | Other | Leave alone. Older #desk, already archived. |
| #Test | test | O2282830000000026003 | organization | created | Damian Knowles | 2019-12-21 | none | 0 | Other | Leave alone. Empty test channel. Archiving it is Damian's call; not proposed. |

## Classification findings

- **Canonical bus:** `agentbus` (#agent-bus). Kept.
- **Duplicate Agent Bus channels:** none. `#agent-bus` is the only channel with "agent" or "bus" in its name. There is also a bot chat named "Agent Bus" (created 2026-10-13). That is the bus bot's own conversation with Damian, not a channel, so it can't be archived like one and isn't proposed.
- **Desktop function channels:** none in Cliq. The desktop (Claude) function agents reach Cliq only through the relay as bus identities (`claude-bizops`, `claude-finance`, and so on).
- **OpenClaw function channels:** none in Cliq. OpenClaw has no per-agent Cliq binding. The function agents' channels are Telegram forum topics in group -1003978037199 (`~/.openclaw/openclaw.json`, `channels.telegram.accounts.business.groups["-1003978037199"].topics.<n>.agentId`: 2-3 bizops, 4 salesmkt, 5 finance, 6 systems, 7 compliance, 8 codedev). Their Cliq path is the `agent-bus` extension (`~/.openclaw/extensions/agent-bus/index.js`), which posts to #agent-bus through the relay with the Keychain key `agent-bus-key-<agent>`.
- **Desktop/OpenClaw overlap:** none in Cliq.
- **Other:** desk, deskj, financereports, assistant, ext:ash, test. All left alone.
