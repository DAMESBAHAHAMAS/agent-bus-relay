# WelcomeIQ Coval Specialist — 2026-10-18

## Selected platform
Slack, DK Operations (T08FY0GQ8PJ). Arsalan Hassan is verified as U0C22CXLLKF.
Private channel C0CAZSHTJ48 / welcomeiq-coval-testing was created.
Membership readback confirms Damian U08FY0GQ9G8 and Arsalan U0C22CXLLKF.
The earlier Cliq channel is retained but is not the selected working channel.
No HumanIQ environment, credentials, or access were provisioned.

## Evidence
Setup/initial baseline guidance posted:
https://damianknowles-vl45706.slack.com/archives/C0CAZSHTJ48/p1792333319706759
This is a Codex setup message using the connected Slack account, not an autonomous bot response.
Arsalan's own inbound message and an automated specialist response have NOT yet been verified.
No actual Coval run has been started. Neither acceptance gate is complete.

## Existing implementation
WelcomeIQ-specific OpenClaw agent and narrow tool installed; merged configuration validated.
Official Coval MCP 0.4.0 and MCP client installed in welcomeiq/node_modules.
Persistent execution journal, zero-spend lock, duplicate prevention and uncertain-submission handling implemented.
The existing bridge and relay have local, unactivated WelcomeIQ extensions.
The installed agent currently uses the existing OpenAI model route if invoked as a conversational turn.
Do not activate conversational inference without verifying an approved runtime/allowance.
The deterministic tool gateway can run status checks without model inference.

## Immediate blockers
1. Native OpenClaw Slack has no configured app credentials. The connected Slack app available to this Codex session
   can create/read/post channel messages, but is not an unattended OpenClaw event subscription.
   slack-app-manifest.json and slack-config.preview.json define the concrete minimal installation.
   Socket Mode reuses the Mac/OpenClaw runtime and requires no public webhook or new hosting.
   Installing the Slack app creates a bot credential and an app-level connections:write credential;
   obtain Damian's authorization under this repository's standing credential/security rule.
   Never request tokens in Slack or chat; reference approved secure storage.
2. No WelcomeIQ-specific Coval credential was found under the two checked Keychain references.
   Damian must authorize the correct Coval organization/credential reference and remaining testing allowance.
   Arsalan supplies target/version, product expectations, and approved target readiness in this channel.
3. Zoho placement remains unresolved. No project named WelcomeIQ appears in the live accessible inventory.
   Do not use the similarly named HumanCall IQ project without explicit confirmation.

## Next actions
Install/connect the approved Slack app, invite its bot into this private channel, and bind ONLY this channel
and these two human IDs to coval-welcomeiq. Preserve the rest of OpenClaw config and the existing bridge.
Verify an actual Arsalan inbound message and useful specialist-generated response.
Connect the project-specific official Coval MCP, verify its live tools and organization scope,
agree the target/suite/metrics with Arsalan, and verify the permitted no-additional-spend allowance before enabling calls.
A successful model answer is not proof of a Coval run; retain the actual run ID and returned metrics.
GPT oversight and Codex escalation follow the core service. The OpenClaw GPT agent is not this ChatGPT conversation.

## ChatGPT work in progress
The optional OAuth/MCP Events adapter is unactivated. Its local software tests do not establish ChatGPT connectivity.
All 14 local tests now pass, including MCP 2 discovery. This is not live ChatGPT acceptance.
Do not report GPT-to-Codex communication complete.


## Ownership and authoritative repository — Damian's 2026-10-18 clarification
Damian owns WelcomeIQ, its source code and associated intellectual property, and retains final authority
over repository access, production changes, permissions and spending.
Arsalan is the primary developer; Codex owns the Coval specialist integration and technical assistance.
Use the existing mature WelcomeIQ GitHub repository for shared testing files and publish proposed changes
on branches and pull requests. Never create a duplicate repository or change its production branch without authorization.
Keep OpenClaw infrastructure, unrelated projects and credentials separate.
GitHub login DAMESBAHAHAMAS was verified; the complete accessible repository inventory contained 14 repositories
and no identifiable WelcomeIQ entry. The GitHub connector's repository search also returned no WelcomeIQ match.
This is an access/identification finding, not a claim that the existing repository does not exist or that ownership differs.
Arsalan was asked directly for the authoritative URL, GitHub username and access confirmation:
https://damianknowles-vl45706.slack.com/archives/C0CAZSHTJ48/p1792333811941579
No application repository was created, modified, restructured or deployed. Shared testing files await URL/access verification.
