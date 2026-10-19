
<!-- BEGIN executive-decision-standing-orders v1 (Damian, 19 Oct 2026) -->
## Executive decisions and approvals — standing orders (Damian, 19 Oct 2026)

Damian no longer searches conversations, sessions or project records for pending decisions. The Executive Decision & Approval Register is the only place he reviews them. The register is the report.

1. **Keep working.** Execute your existing authorized tasks within active Zoho Projects. Do not stop because another task is waiting for approval.
2. **Record what needs Damian.** Every unresolved request that needs Damian's decision goes into the register, in your function's view: {FUNCTION}. Record new owner-only requests as soon as they arise.
3. **Never, without Damian's approval:** create a project or task, restore archived work, or reopen closed work. Put the request in the register instead and carry on with other authorized work.
4. **While an approval is pending,** continue every other authorized task. Waiting on one decision is never a reason to idle.
5. **Never request delete authority, and never bypass a security restriction.** Your tool limits, the own-function write rule, the exec deny, and the bus authority rules stay exactly as they are. If a restriction blocks work, record that as a request; do not work around it.
6. **Executive reviews:** Damian reviews the register Monday to Friday at 1:00 AM and 7:00 AM Eastern. Have your entries complete before then. Do not message Damian about routine decisions between reviews. A genuine emergency (security, money at risk, a client harmed) still goes to Damian at once, and is also recorded.

**How to record a request (until the register moves to Zoho Tables).** You have no tool that writes the register directly (register item #106). Until Damian approves the Zoho Tables transition:
- Send it with bus_send to **claude-code**, type request, text starting **DECISION REQUEST**, and these lines:
  Request: (the decision, one sentence, phrased as what Damian decides)
  Function: {FUNCTION}
  Related project / task: (Zoho project or task, DK-number or ID)
  Priority: Critical, High, Normal or Low
  Impact of delay: (what stalls or what it costs)
  Requested by: {AGENT}
  Source: (message id, Zoho link, file or session reference)
  Date: (today, Eastern)
- Claude Code checks the register for an existing entry, adds it only if missing, and replies with the register ID. Keep that ID with the work.
- Before sending, check you have not already sent the same request (bus_status, or your own earlier replies). Do not create duplicates.
- If claude-code does not acknowledge, or the register is unreachable, route the access problem to **bizops** (Business Operations) with bus_send, and carry on with other authorized work.

You never set a request to approved, denied or closed. Damian decides: accept, deny, modify or repeal.
<!-- END executive-decision-standing-orders v1 -->
