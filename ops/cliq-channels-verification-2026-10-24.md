# Cliq function channels: verification and fix, 2026-10-24

Session agent-bus-relay-e5, on Damian's instruction ("I want it to work").

## Result
All 7 channels answer Damian in the main channel, from live Zoho Projects data. Test question posted from Damian's account about 20:38 UTC: "TEST: What is your top priority and its status? Answer in 3 lines."

| Channel | Agent | Answer message id | Time to answer |
|---|---|---|---|
| oc-finance | finance | 1792874334002_366945191730 | 25 s |
| Senior Projects Manager | zia-projects | 1792874392000_147901917632 | 68 s |
| oc-business-operations | bizops | 1792874392955_190851591547 | 86 s |
| oc-sales-marketing | salesmkt | 1792874430940_96362349020 | 2 min |
| oc-compliance-filings | compliance | 1792874463683_74887545283 | 2 min 25 s |
| oc-systems-automation | systems | 1792874465218_104952317890 | 2 min 30 s |
| oc-command | maryalice | 1792874481705_152196974633 | 2 min 40 s |

## Fault fixed
Damian's 20:24 messages failed because another session restarted the OpenClaw gateway at 20:24:28 (reason=desk-article-tools). The bridge failed in seconds and depended on one relay re-delivery.
Fix (commit c81b6a3): a failed channel wake is retried every 20 s for up to 10 minutes.
Verified: gateway restarted 20:45:42 UTC, test posted in oc-finance (1792874734395_371240559419), 5 wakes failed during the 2.5-minute warm-up, finance answered at 20:48:34 (1792874914058_379830673674).

## Open
- Gateway restarts by other sessions still delay answers by about 3 minutes. Restarting OpenClaw at a quiet time avoids it.
- Not this session's work, left uncommitted: the read-only Zoho Tables change in bridge/bus-bridge.js (the `reader` flag is defined but not used yet), .claude/settings.json, ops/APPROVED_PROJECTS.md (Finance Autonomy entry), ops/oc-channels-2026-10-17.md, openclaw/*.py, ops/zoho-social-post.py.
- 8 TEST messages remain in the channels (archive, never delete).
