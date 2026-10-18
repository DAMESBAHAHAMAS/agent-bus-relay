# Order 1 Day 3 verification, 2026-10-17 (steps 1-5)

Relay 1ab3da5. Bridge f9d7712 code plus local WelcomeIQ block (inert, WELCOMEIQ_ENABLED unset).

## Step 1: signed hellos in the six oc- channels: PASS
| Agent | Damian's prompt id | Signed hello id | Time |
|---|---|---|---|
| bizops | 1792274286783_39927630015 | 1792274315300_44222625828 | 21:58:35Z |
| finance | 1792274287204_57107499620 | 1792274324950_61402504662 | 21:58:44Z |
| salesmkt | 1792274287654_44222598182 | 1792274345263_48517623087 | 21:59:05Z |
| systems | 1792274288090_44222598618 | 1792274355857_48517633681 | 21:59:15Z |
| compliance | 1792274288508_39927631740 | 1792274295590_44222606118 | 21:58:15Z |
| maryalice | 1792274288910_52812534030 | 1792274304885_57107517301 | 21:58:24Z |

## Step 2: handshake re-test
- bizops -> finance: PASS. Damian's prompt 1792274374169_48517651993; bizops' first send was refused `unverified_authority` (refused-3b737753: a channel message is not a #agent-bus authority); bizops resent as its own request. Correlation id f6f3e5b7-45f4-4d2d-8fad-c5a317223b66, requested 22:00:06.996Z, acknowledged by finance 22:00:12.338Z (5 s). bizops replied in channel 1792274410774_52812655894.
- finance -> systems: FAIL (not started). Damian's prompt 1792274374659_65697521667 in oc-finance was queued by the relay (oc_message 22:00:19.912Z) but never delivered to finance.
  Cause: the bridge keeps one `since` cursor per agent for bus and channel messages. The bizops request (22:00:06.996Z) moved finance's cursor past the channel message's own time (21:59:34.659Z), and the relay read the channel later (22:00:19.912Z), so `ocInbox(agent, since)` filtered it out. Any agent with bus traffic between Damian's post and the next channel poll loses his message.

- finance -> systems RE-TEST after relay fix 1d110f7 (relay restart 22:14:33Z, oc-alerts 1792275273013_22748747061): PASS. Damian's prompt 1792275308756_69993423060. Bridge: "22:16:08.069Z finance woken by Damian in its Cliq channel, message 1792275308756_69993423060". Correlation id 88bf5343-1895-4d38-a50e-fd9a32a781b0, requested 22:16:19.048Z, acknowledged by systems 22:16:27.082Z (8 s). finance replied in channel 1792275381364_74288462964.

## Step 3: Mary-Alice line in oc-command: PASS
Damian's prompt 1792275400529_61403580241 (22:16:40Z). Woken 22:17:17.788Z. Reply 1792275444720_65698591728 (22:17:24Z): "Status 17 Oct: channel verified and the reply-echo loop resolved; no bookings in the queue and nothing else outstanding." Signed a748202085bdd6af.

## Step 4: automated oc-alerts post (non-listening ops route, Damian's choice in the Mac session)
One request, claude-code -> ops, correlation id d02015d9-f5d4-469c-b495-c9b68bccc973, sent 2026-10-18T01:43:39.873Z.
- Immediate alert: PASS. oc-alerts 1792287819954_27056261298 at 01:43:39Z: "[relay] MANUAL: ops has a new request from claude-code and is not listening, so it cannot be woken automatically. ... Request ID d02015d9-...". Audit: human_alert manual status 200 (DM to Damian) at 01:43:39.958Z; oc_alert status 200 at 01:43:39.976Z.
- Reminder re-notify to ops at 01:45:48Z (audit `reminded`).
- Delayed no-acknowledgment alert: PASS. oc-alerts 1792288428496_31351837136 at 01:53:48Z: "[relay] URGENT: No acknowledgment. ops has not acknowledged a request from claude-code after 10 minutes. Request ID d02015d9-...". Audit: human_alert urgent status 200 (DM to Damian) at 01:53:48.512Z; oc_alert status 200 at 01:53:48.545Z. Ledger state escalated. No further requests were sent; the request stays escalated (it fires once).

## Step 5: Telegram topic bindings for the five function agents (Damian's conditional approval in the Mac session)
Pre-change evidence: Cliq reachability for all six agents in step 1; bus handshakes bizops->finance and finance->systems in step 2.
Inventory (from ~/.openclaw/openclaw.json and ~/.openclaw/state/openclaw.sqlite):
- The bindings were topic routes in the business Telegram group -1003978037199 (account `business`), at channels.telegram.accounts.business.groups["-1003978037199"].topics: 2 and 3 bizops, 4 salesmkt, 5 finance, 6 systems, 7 compliance. Topic 8 (codedev), topic 1 (already off) and "*" (off) are unchanged.
- bindings[3] (group -> bizops) and bindings[4] (business-account DM -> bizops) are not topic bindings and are unchanged. Deleting the topic agentIds alone would have let bindings[3] route those topics to bizops, so each topic was disabled, matching topic 1.
- Scheduled jobs: the five agents each have a weekly "Skill collection review" with delivery mode none, so none posts to Telegram. The heartbeat is defaults.heartbeat agentId main (Mary-Alice) only.
- Sessions: no Telegram-topic session heads for the five agents in session_state_heads (agent:<id>:main only). The bus uses session keys agent-bus and cliq-channel, so any Telegram-topic conversation history does not carry into Cliq.
- Lost with the topics: media (photos, voice notes, files). The relay's oc- path is text only. Telegram was reactive for these agents (AGENTS.md: "reply in the same authorized Telegram topic that received the instruction"); in Cliq they reply in their own oc- channel.
Backup: ~/.openclaw/backups/openclaw.json.pre-order1-telegram-topics-20261018T014505Z, sha256 7220daff63287972f863fc580bbb4338da7da7afbc8e7227bff4b644d0114b03 (identical to the live file before the change).
Change: `openclaw config patch` (dry run, then apply, 18 updates; "Change will apply without restarting the gateway"). Each of topics 2-7 set to {"enabled": false}. The live file equals the pre-validated copy, and `openclaw config validate` reports valid.
Hashes (sha256 of canonical JSON, first 16 hex), before = after: bindings[0] 6b6126a11da407e9, bindings[2] c007d9b4aae4641e, telegram default account 394776108bf87bd6, telegram top level 175a806812199427, heartbeat 19558c4da3c84722, whatsapp 31fee4ec3c7bb26a, all bindings 6aff7c726c16e555, business account minus groups 10fa632b04106b4e, topic 8 1a9ea9a0490e52cd. Whole telegram block d2f82b920d08aa42 -> bc7efe0190e6918d (the topics only).
Post-change checks (2026-10-18), all PASS:
| Agent | Cliq prompt | Signed reply | Bus request | Ack |
|---|---|---|---|---|
| bizops | 1792288043751_117250798311 | 1792288122619_121545844475 (01:48:42Z) | 237d4067-b7e8-40d2-834c-d623d5481b3c | 9 s |
| finance | 1792288044177_87186027665 | 1792288134617_91481085401 (01:48:54Z) | 213be63e-a1d6-45db-9e91-d8dd2cab80f2 | 5 s |
| salesmkt | 1792288044583_61416224295 | 1792288167233_65711314241 (01:49:27Z) | 187e0abc-14da-4767-84b3-1ab2137f78a6 | 8 s |
| systems | 1792288045010_61416224722 | 1792288174322_65711321330 (01:49:34Z) | 8e16d119-aae0-48c1-9bb1-91f52605da55 | 11 s |
| compliance | 1792288045420_57121257836 | 1792288103818_61416283530 (01:48:23Z) | 4ff68f1b-1fac-4e5f-b651-6b0d50551efc | 9 s |
Mary-Alice: `openclaw channels status` shows Telegram default enabled, running, connected, and Telegram business running, connected. `openclaw agent --agent main` replied PONG after the change. Her binding hashes are unchanged.
Rollback:
    cp -p ~/.openclaw/backups/openclaw.json.pre-order1-telegram-topics-20261018T014505Z ~/.openclaw/openclaw.json
    openclaw config validate
    launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway   # only if the change is not hot-applied
