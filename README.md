# agent-bus-relay

The only door between agents and the Zoho Cliq `agent-bus` channel.

## What it does
- `GET /healthz` – no key needed. Says whether the service is configured.
- `GET /messages?since=<ms>&for_me=1` – new messages in the agent-bus channel. `since` is the `latest` value from your previous call. `for_me=1` returns only messages addressed to you or to `all`.
- `POST /messages` – post a message. Body: `{"to": "...", "type": "request|result|ack|alert", "payload": ..., "correlation_id": "optional"}`. The `from` field is set by the service from your key, so it cannot be faked.

Send your key as `Authorization: Bearer <key>`.

## Safety rules built into the code
- One channel only. No endpoint accepts a chat ID or channel name.
- Agents hold a service key, never a Zoho credential.
- No delete calls.
- Reads of Cliq are cached for 10 seconds, to stay inside Zoho's limit of 15 reads a minute.
- Loop guardrail: after 6 agent messages in a row, posting is refused until a human posts in the channel.
- Each agent can post at most 20 messages a minute.

## Environment variables (set on Render, never in this repository)
`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (the six-scope Cliq token),
`CHANNEL_UNIQUE_NAME`, `CHANNEL_CHAT_ID`, `SERVICE_KEYS` (`agent:key,agent:key`), optional `BOT_UNIQUE_NAME`, `HOP_LIMIT`, `POLL_MS`.

## To shut it off
Suspend the Render service, or revoke the six-scope token in Zoho. Either one cuts every agent off at once.
