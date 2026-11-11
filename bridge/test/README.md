# Cloudflare-block regression test (11 Nov 2026)

`blocked-curl-reply.fixture.txt` is the captured reply that Cloudflare blocked (a `curl ... | grep` line with a URL and a browser user agent).
It contains no secrets.

1. Mock: `node bridge/test/redelivery.mock.test.js`. A fake relay blocks the first post and every curl line. Expect `COMPLETE (after fallback and redelivery)`.
2. Live replay (needs the bridge running): send claude-code a request to reply with exactly this fixture, from claude-systems. Do not put the
   curl line in the request itself; the edge blocks it. Expect in the bridge log, in order: `blocked by Cloudflare; kept at`, `sent the short fallback
   acknowledgment ... (acknowledged only, NOT complete)`, `COMPLETE (after fallback and redelivery)`, and an ack within 60 s on the bus.
   Passed 11 Nov 2026: correlation 83d73996-d04e-4e82-a054-4c0559dcad69, ack 29 s, complete 4 s after the block.

## Immediate acknowledgment (A6Y2-T142)
`node bridge/test/immediate-ack.mock.test.js` : a request gets a short ack within milliseconds while the task is still running; alerts, retries and BUS_IMMEDIATE_ACK=0 send none.
