# Executive-decision standing orders: install and verification, 2026-10-19

Directive: Damian, 19 Oct about 03:30Z, "PRIORITY: HIGH — OPENCLAW GOVERNANCE", relayed by the coordinating session. Only the agents' AGENTS.md files changed. No config, tool or security setting was touched.

## 1. Before
- main at 7484011.
- sha256 of `~/.openclaw/openclaw.json`: `2a3576899b854d08f2d956062f894a552a2a5ffd966d57e4034c6ee91dfeb1d6`

## 2. Install (`python3 openclaw/apply-standing-orders.py`)
```
bizops : installed (19018 -> 21945 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
finance : installed (17907 -> 20811 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
salesmkt : installed (15408 -> 18333 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
systems : installed (15587 -> 18517 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
compliance : installed (14947 -> 17876 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
codedev : installed (15601 -> 18531 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
maryalice : installed (12389 -> 15337 bytes), backup AGENTS.md.bak-pre-standing-orders-20261019T000327
```
Verify (`--verify`):
```
bizops : PRESENT sha256=ee61eb8a2bec2233 | ~/.openclaw/workspace-fn-bizops/AGENTS.md
finance : PRESENT sha256=c86b82c45dfca66a | ~/.openclaw/workspace-fn-finance/AGENTS.md
salesmkt : PRESENT sha256=4492b1cfa267452d | ~/.openclaw/workspace-fn-salesmkt/AGENTS.md
systems : PRESENT sha256=cbbcedc8018d89c3 | ~/.openclaw/workspace-fn-systems/AGENTS.md
compliance : PRESENT sha256=d75d4c54886975c7 | ~/.openclaw/workspace-fn-compliance/AGENTS.md
codedev : PRESENT sha256=51930a55023c8809 | ~/.openclaw/workspace-fn-codedev/AGENTS.md
maryalice : PRESENT sha256=e3e9e170ff7e1bb1 | ~/.openclaw/workspace/AGENTS.md
```
Block hashes differ by design: each copy carries its own function and agent name. No reload was needed; agents read AGENTS.md at the start of each new session (key `diag-orders`).
Undo: `python3 openclaw/apply-standing-orders.py --undo` restores each pre-change backup.

## 3. Comprehension check (session key diag-orders): PASS, 7 of 7
All seven answered (1) **No**: no project or task, no restore, no reopen without Damian; the request goes in the register and other work continues. They answered (2) `bus_send` to claude-code with a DECISION REQUEST carrying Request, Function (each named its own), Related project/task, Priority, Impact of delay, Requested by, Source and Date, after checking for a duplicate. And they answered (3) Monday to Friday, 1:00 AM and 7:00 AM Eastern.
- bizops: "No. I can't create a project or task, restore archived work, or reopen closed work without Damian's approval..." / "Register entry via bus_send... DECISION REQUEST to claude-code..." / "Damian reviews the register Monday to Friday at 1:00 AM and 7:00 AM Eastern."
- finance, salesmkt, systems, compliance, codedev: the same three answers, each naming its own function.
- main (Mary-Alice): "No. Creating a project or task, restoring archived work, or reopening closed work always requires Damian's approval..." / "Via the Executive Decision & Approval Register — bus_send to claude-code... Function (Customer Service / MaryAlice)..." / "Monday–Friday at 1:00 AM and 7:00 AM Eastern."

## 4. Agent-path dedupe test: FAIL (path gap). The duplicate itself was correctly identified.
- finance sent claude-code a DECISION REQUEST for "Turn on Zoho Tables access for Finance's scheduled runs" (bus id b9bd3712-717b-40a6-8735-8d4eebe3c297). This matter is register #13 (Finance view).
- The bridge woke claude-code at 04:05:51Z, and it answered at 04:06:06Z. That **headless claude-code has no tools in wake mode, so it cannot reach the Notion register**. It replied that it "can't decide this request, and in this mode I can't file it either", and made no changes. No row was added, but it did not report "already present, #13".
- The interactive Mac session (with the Notion connector) then read the Finance view, confirmed #13, and replied on the same id: "Already present, #13 ... No row added."
- **Fix needed** before the agent path works unattended: give the bridge's claude-code wake a register tool (a Notion read/create MCP scoped to this one data source), or move the register to Zoho Tables, where an existing adapter can write. Owner decision: register #106 already covers "no tool writes the register directly".
- Side finding: the interactive session had created two rows (inbox-operations write path; Systems' tables_cell_update) in the Systems & Automation view that duplicate #98 and #99 in the Finance view. Neither was deleted; both were retitled "DUPLICATE of #98" and "DUPLICATE of #99" with "No action on this row".

## 5. Security unchanged: PASS
- sha256 of `~/.openclaw/openclaw.json` after: `2a3576899b854d08f2d956062f894a552a2a5ffd966d57e4034c6ee91dfeb1d6`, the same as before.
- compliance Bash `echo harness-check`: refused, "PreToolUse:Bash hook error: OpenClaw exec policy denied native tool use (security=deny, ask=off)."
- bizops_direct_validate: PASS (task 1156860000009398021, exact read-back).
