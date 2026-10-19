# Project Dispatch & Execution Control

The existing Executive Capture Register mapping is reused. Zoho Projects remains the execution ledger. No project/task creation, new agent, new credential, permission expansion, paid infrastructure, or existing bridge/relay edits are required.

## Entry points

Run `python3 dispatch/control.py <command>` from this repository:

- `scan`: read business Projects and their tasks/milestones; save priorities, function routing, ownership and execution gates to `~/.openclaw/state/project-dispatch/latest-scan.json`.
- `run`: reconcile receipts, dispatch eligible work (one active request per function), and consolidate reports.
- `reconcile`: collect actual recipient ACK/COMPLETE/BLOCKED receipts. Every state is appended to the same existing task's comments.
- `report`: refresh `latest-report.json` from the Business calendar and execution ledger. Reports are pull-only; no routine messages to Damian.
- `proof`: bounded read-only request on the existing pinned acceptance-test record, followed by `reconcile`. Repeating it prevents duplicate dispatch.
- `tick`: reconcile and refresh reports without starting backlog work. Installed launchd service runs this every 15 minutes.
- `verify --cid ID --plan task-plan.json [--close]`: independently read deliverables against a locally authored deterministic acceptance plan. Closure is separate and requires verified read-back.

## Routing and authority

Existing function metadata, then the existing named business project, determines the responsible function. A named `EXECUTION ACTOR` can select another of the six existing business executors. Unknown actors and unclear function ownership are held. Zoho human owners, priorities, dates and milestones are preserved. A task explicitly naming Damian as executor is held. Current function capability/tool fences still apply; an executor reports a real missing capability through its existing fallback chain.

The sender is the existing `claude-systems` integration function; Keychain resolves its existing key by reference. Recipients are limited to bizops, systems, finance, salesmkt, compliance and codedev. There is no MaryAlice recipient path and no change to her authority. MaryAlice and Business Operations remain peers under Damian; this dispatcher cannot have Business Operations direct MaryAlice. Outside agents cannot submit or approve work here.

Existing API resource fences establish access, not blanket approval. The implementation recognizes `execution_approved: true` or `DISPATCH APPROVED: yes` as explicit approval signals. **These signals were not found in the scanned backlog. Their mapping to the existing authoritative approval convention is unresolved; this is not a request to re-audit the Capture Register mapping.** Do not mass-add these markers or assume Open means authorized. The user must identify the existing approval convention before unattended backlog execution starts.

Tasks need Definition of Done, Evidence Required and explicit Dependencies. Existing description fields are supported. Known WBS predecessor references must resolve uniquely within the project and be closed. Unknown native dependency structures and prose qualifiers are held, never ignored. Priorities and due dates determine scan order. The current conservative implementation holds native dependency structures for review rather than automatically resolving them. Explicitly material actions remain gated by existing authority.

## Durability, acknowledgment, and uncertain outcomes

Correlation ID is deterministic from Zoho project/task IDs. SQLite has a unique project/task constraint, full synchronous journaling and a process lock. It is a local outbox/cache, not a replacement ledger. Zoho comments contain intent, delivery, ACK, verification and exception markers. Bus history and existing task comments prevent replay even if the local cache is lost. An uncertain send is never resent automatically. Prepared runs can resume only before a send was attempted and after reconciliation.

Recipient identity and correlation parties are checked. An ACK proves receipt only. COMPLETE prose moves to awaiting_verification. It never closes a business task. The safe proof compares the actual recipient JSON against an independent task read. Generic business completion needs a task-specific verifier; no generic prose classifier pretends to verify arbitrary deliverables.

Write timeouts remain uncertain until an independent destination read reconciles the effect. Failed comment writes cannot be bypassed to dispatch work. Terminal execution states retry idempotent ledger publication on later ticks.

## Acceptance plans

Plans live in `dispatch/plans/`, authored/reviewed by the implementing function with existing authority, never taken from executor reply text. A plan pins `project`, `task`, and `acceptance_sha256` (the hash of current acceptance/evidence/dependency requirements), plus nonempty `checks`. Each check includes a `criterion`, an allowed read `operation` (`project_task`, `workdrive_text`, or `workdrive_metadata`), its `params`, a JSON `path` array, and an exact `equals` or nonempty `contains` assertion. All checks must pass against fresh reads. Plans must cover all acceptance criteria; subjective acceptance requires owner review rather than a superficial substring check. No shell, arbitrary URL or executor-provided verification code runs.

`verify --close` performs a fresh task read, ensures criteria have not changed, records closure intent, applies completion_percentage=100 through the existing Projects helper, and independently confirms closed status. Uncertain closure is not repeated. Real business closure is implemented but has not been exercised live: the existing safe test task was already closed and was preserved.

## Fallbacks and reporting

Executors retain their existing native tool → registered matching Zia Master → R-0112 claude-systems chain. Projects read failures during `run` invoke the existing registered Projects Zia request with a stable request ID and exact primary error. Fallback outcomes are recorded separately and are not accepted as proof of task completion. `scan` is strictly read-only and does not invoke a fallback agent. Milestone read failures hold new dispatch but do not hide independent task inventory. Model fallback stays within the agent's existing configuration.

Reports combine queue exceptions, actual receipts and verification evidence, and the next seven days of matching function blocks from the existing Business calendar. Missing blocks are explicit. No schedule is invented, no Personal data enters reports, and no routine human notifications are sent. The relay's existing genuine non-ACK escalation behavior is reused unchanged.

## Deployment and rollback

`python3 dispatch/service.py install` installs a separate local launchd job for `tick`. It checks existing scheduler state first and refuses to overwrite differing settings. The existing bridge, relay, agent configs, credentials and calendars remain unchanged. Until approval/schedule mapping is resolved, the service tracks receipts and refreshes reports only.

Rollback: `python3 dispatch/service.py stop` unloads the service and archives its plist. Keep the local SQLite database and Zoho comments to prevent replay and preserve evidence. No task/project deletion is needed. This implementation deliberately leaves existing uncommitted repository work untouched.

## Verification

`python3 dispatch/test_control.py` tests approval/dependency gates, external recipient rejection, duplicate prevention after uncertain delivery, ACK/COMPLETE separation and sender mismatch. See `EVIDENCE.md` for live results and remaining gaps.
