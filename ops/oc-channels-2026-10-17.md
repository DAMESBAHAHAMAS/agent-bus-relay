# oc- channels, created 2026-10-17

Invite-only organization channels (Damian, 2026-10-17). Damian is the only member. Created with the 66-scope token.

| Name | Unique name | Channel id | Chat id | Agent | Charter message id | Pinned |
|---|---|---|---|---|---|---|
| oc-business-operations | ocbusinessoperations | O2282830000002366001 | CT_1424665092475599480_665429212 | bizops | 1792264045098_5557649962 | yes |
| oc-finance | ocfinance | O2282830000002361003 | CT_1424665092475655574_665429212 | finance | 1792264046280_5557651144 | yes |
| oc-sales-marketing | ocsalesmarketing | O2282830000002361005 | CT_1424665092475656337_665429212 | salesmkt | 1792264047487_5557652351 | yes |
| oc-systems-automation | ocsystemsautomation | O2282830000002367001 | CT_1424665092475656932_665429212 | systems | 1792264048671_5557653535 | yes |
| oc-compliance-filings | occompliancefilings | O2282830000002366003 | CT_1424665092475708307_665429212 | compliance | 1792264049570_5557654434 | yes |
| oc-command | occommand | O2282830000002367003 | CT_1424665092475708917_665429212 | maryalice | - | - |
| oc-alerts | ocalerts | O2282830000002366005 | CT_1424665092475709602_665429212 | alerts | - | - |

OC_CHANNELS={"bizops":"CT_1424665092475599480_665429212","finance":"CT_1424665092475655574_665429212","salesmkt":"CT_1424665092475656337_665429212","systems":"CT_1424665092475656932_665429212","compliance":"CT_1424665092475708307_665429212","maryalice":"CT_1424665092475708917_665429212"}
OC_ALERTS_CHAT=CT_1424665092475709602_665429212

## Added 2026-10-19: Senior Projects Manager
Created on Damian's direct request, same settings as the oc- channels (organization, invite-only, Damian the only member), with the 66-scope token.

| Name | Unique name | Channel id | Chat id | Agent |
|---|---|---|---|---|
| Senior Projects Manager | seniorprojectsmanager | O2282830000002366013 | CT_1424665093511648587_665429212 | zia-projects |

- Bus: zia-projects is internal; bizops, finance, salesmkt, systems, compliance and maryalice may each send it requests, and it may send to each of them (relay /agents, 2026-10-19). Live test: ops -> zia-projects spm-link-test-021528, answered and acknowledged in about 7 s (reply message 1792390536052_3703650982772).
- Pending: add `"zia-projects":"CT_1424665093511648587_665429212"` to OC_CHANNELS on Render and redeploy; add the Agent Bus bot to the channel for instant delivery.
