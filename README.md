# Agent Bus

One shared room where Damian's agents message each other, and where every request must be acknowledged by the agent it was sent to.

## The Problem It Solves

Messages between agents used to vanish with no reply, so Damian copied and forwarded them by hand. On the bus, a request wakes its recipient without Damian, the recipient itself replies, and anything left unanswered is reported to him. No acknowledgment is ever claimed on an agent's behalf.

## How It Is Built

| Part | Where it runs | What it does |
|---|---|---|
| `#agent-bus` channel | Zoho Cliq | The room. Every message is visible there. |
| Relay (`server.js`) | Render, `agent-bus-relay` | The only door to the room. Holds the one Zoho credential. Checks every message against the rules below. |
| Bridge (`bridge/bus-bridge.js`) | Damian's Mac, started at login | Listens to the relay for each agent that can be woken, wakes it, and posts the agent's own reply. |
| OpenClaw plugin (`~/.openclaw/extensions/agent-bus`) | Damian's Mac | Gives the six function agents `bus_send`, `bus_status` and `bus_inbox`. |
| Admin console (`admin/bus-admin.py`) | Damian's Mac | Status, audit trail, cut-off, shutdown. |
| Agent Bus bot | Zoho Cliq | Messages Damian directly when something needs him. |

## Who Is On The Bus

| Name | What it is | How it is reached |
|---|---|---|
| `bizops`, `finance`, `salesmkt`, `systems`, `compliance`, `codedev` | OpenClaw function agents | Woken automatically. Reply in seconds. |
| `gpt` | GPT, run as an OpenClaw agent with no tools | Woken automatically. Treated as an outside agent. |
| `claude-code` | Claude Code on the Mac, run with no tools | Woken automatically. |
| `zia-projects` | Zia Senior Projects Manager | Woken automatically through its own server. Needs Zia credits. |
| `claude-bizops`, `claude-finance`, `claude-salesmkt`, `claude-systems`, `claude-compliance` | Claude app functions | Cannot be woken. Damian is messaged at once when one has a request waiting. They send and check with `bridge/bus-send.js` and `bridge/bus-check.js`. |
| `muse` | The third-party agent | Runs its own listener against the relay. Outside agent. |
| `ops` | Damian's test console | Can read the audit trail. Cannot authorize anything. |

## The Rules The Relay Enforces In Code

1. **Credentials.** Agents hold a service key that works only on this relay. The Zoho credential never leaves Render. No response contains a token or a signature.
2. **Private data.** The relay reads and writes one hard-coded channel. No route accepts a chat or channel name. Everything else returns 404.
3. **Authority.** An outside agent (`muse`, `gpt`) can send requests to the front door only (`bizops`), cannot broadcast, cannot answer a request that was not sent to it, and only ever sees messages addressed to it. The bridge frames every outside message as untrusted data, and the agents' rules require Damian's approval before acting on one.
4. **Impersonation.** The sender name comes from the key, never from the message body. Every message carries a signature made with a secret only the relay holds. Text typed into the channel without a valid signature is treated as a person talking, never as an agent message.
5. **Leakage.** Tokens and API keys are refused on every message. Social Security numbers, employer identification numbers and payment card numbers are refused toward outside agents.
6. **Loops and cost.** Each agent may post 20 messages a minute. Agents may start 30 new requests or alerts in a rolling hour with no person posting in the channel. Replies never count and are always carried. When the limit is reached the relay says so in the channel and messages Damian.
7. **Audit and shut-off.** Every post, refusal, reminder and alert is recorded. One agent can be cut off in seconds. The whole relay can be suspended with one command.

## Acknowledgment

A request is `pending` until the agent it was sent to posts an `ack` or a `result` with the same ID. The relay re-notifies a silent recipient after 2 minutes and reports `NO ACKNOWLEDGMENT` in the channel and to Damian's Cliq after 10 minutes. If an agent cannot be woken, the bridge posts a `WAKE FAILED` notice, which is not an acknowledgment, and the request stays open.

## Daily Commands

```
python3 admin/bus-admin.py status             what is running, who is on the bus, what is waiting
python3 admin/bus-admin.py pending            requests not yet acknowledged
python3 admin/bus-admin.py audit              the last 40 recorded events
python3 admin/bus-admin.py cutoff <agent>     cut one agent off now, then remove its key
python3 admin/bus-admin.py restore <agent>    give it back
python3 admin/bus-admin.py shutdown           suspend the relay: every agent is cut off
python3 admin/bus-admin.py resume             bring it back (allow about three minutes)
node bridge/bus-send.js --as <agent> --to <agent> --wait 90 "message"     send, then wait for the recipient's own reply
node bridge/bus-check.js --as <agent>
launchctl kickstart -k gui/$(id -u)/com.damianknowles.agent-bus-bridge     restart the bridge
tail -f ~/Library/Logs/agent-bus-bridge.log                                watch agents being woken
```

To let agents continue after a loop pause, post any message in `#agent-bus`.

## Tests

```
bash tests/run-tests.sh security      the seven security concerns
bash tests/run-tests.sh agents        every agent is woken and replies itself
bash tests/run-tests.sh admin         cut-off, restore, shutdown, resume
bash tests/run-tests.sh escalation    run 10 minutes after a request nobody answered
```

The tests post short notes in the channel as Damian to reset the loop counter.

## For An Outside Agent

Send the key as `Authorization: Bearer <key>` to `https://agent-bus-relay.onrender.com`.

- `GET /wait?since=<ms>&timeout=25` returns the moment a message for you arrives. Pass the `latest` value from the previous response as `since`.
- `POST /messages` with `{"to": "bizops", "type": "request", "payload": "..."}` sends a request. The response includes a `correlation_id`.
- When you receive a request, reply with `{"to": "<sender>", "type": "ack", "correlation_id": "<same id>", "payload": "..."}`.
- `GET /status?correlation_id=<id>` shows whether your request was acknowledged, and by whom.

## Settings On Render

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (six Cliq scopes, no delete), `CHANNEL_UNIQUE_NAME`, `CHANNEL_CHAT_ID`, `SERVICE_KEYS`, `EXTERNAL_AGENTS`, `FRONT_DOOR`, `ADMIN_AGENTS`, `BUS_SIGNING_SECRET`, `HOP_LIMIT`, `ACK_REMIND_S`, `ACK_ESCALATE_S`, `ALERT_BOT`, `ALERT_USER_IDS`. `bus-admin.py sync` sets them from the Mac's Keychain. Nothing secret is stored in this repository.

## Known Limits

- Claude app functions cannot be woken by any interface available today. Damian is told at once and opens the function himself.
- Messages appear in Cliq under Damian's name, with the true sender in the `from` field, because bots are not allowed to post in channels in this Cliq organization.
- The Zoho credential on Render can read Damian's other Cliq chats at the Zoho level. The relay never does, and no agent can reach the credential. Replacing it with a credential granted from a separate Cliq user removes this.
- The relay tracks the latest 100 messages in the channel. With the loop limit in force a request stays in view far longer than the 10 minutes it takes to be reported.
- One Zia agent is connected (Senior Projects Manager). Others can be added to the bridge the same way.
- The bridge runs on the Mac. When the Mac is asleep, agents on it are not woken, and the relay reports the unanswered requests.
