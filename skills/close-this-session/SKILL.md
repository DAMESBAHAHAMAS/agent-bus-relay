---
name: "close-this-session"
description: "Close one working session as a settlement and control process — capture unresolved decisions for Damian in the Executive Decision & Approval Register, anchor the session, write the eight-section handoff, reconcile every artifact, check project goal alignment, and mark the thread CLOSED. Use when Damian says close the session, wrap up, end of day, session close, or I am done for now."
---

# Close This Session

## The frame

You are the **outgoing engineer writing the shift handoff before you leave the building.**

The person who picks this up was not here. They did not see the conversation. They cannot ask you a follow-up question. Everything they need has to survive in what you write down.

**Write for absence, not for memory.**

A close is a **settlement**, not a summary. When it succeeds, the thread is retired and everything material lives somewhere durable. The thread itself becomes disposable.

## Scope of this skill

This skill closes **one session** correctly.

It does **not** find sessions, schedule closes, or check that every open session got closed. That is the job of a separate session-close control, which calls this skill once per eligible session and reconciles the results. Do not build that logic in here.

## The asymmetry that makes this work

The Resume prompt is a **read**. This skill is a **write**. Every section below produces the artifact that the resume prompt will later consume.

| This skill writes | Resume reads it as |
|---|---|
| Stopping Point | §1 Executive Summary and §3 Current Status |
| Completed This Session | §2 What Was Completed |
| Open Items and Blockers | §4 Outstanding Issues |
| Decisions Closed | §5 Decisions Already Made |
| Next Actions | §6 Immediate Next Steps |
| Context and Warnings | §7 Important Context |
| The Single Next Task | §8 Suggested First Task |

If a section here is skipped, the corresponding section of the next resume comes back empty. That is the cost, and it is not visible until days later.

---

## CLOSED means CLOSED

- After a successful close, the thread is **retired from operational use.**
- New work begins in a **new session**, resumed from the durable handoff.
- **Do not continue operational work in a closed thread.** If asked to do new work in a thread whose anchor says CLOSED, say so in one line and point to starting a new session from the handoff.
- A closed session counts as **fully processed.** If this skill is invoked on a session that is already CLOSED, do not close it again. Report "Already closed — [Session ID], [closed date/time]" and stop, **unless** the request is explicitly an audit or recovery action. In that case, label the output AUDIT or RECOVERY and do not change the original close record.

---

## Two modes

**Mode A — canon connected.** File access exists and `CANON/` is reachable. **Write the files.** Do not merely propose changes.

**Mode B — no file access.** Browser chat, or a session with no connected folder. **Output the complete block as paste-ready markdown**, clearly separated by destination file, so it can be pasted in later without editing.

State which mode you are in, in the anchor.

**Canon location (R-0102, 29 Sep 2026).** One master canon: WorkDrive `05_OPERATIONS/CANON`. Mac mount: `/Users/damianknowles/Library/CloudStorage/ZohoWorkDriveTrueSync-DamianKnowles/05_OPERATIONS/CANON/`. The old path `~/Claude/Projects/Business Operations/CANON/` is a symlink bridge only; never cite it. The WorkDrive team folder `_CANON` is superseded. Every `CANON/` path below resolves against the master.

**Canon change publication rule (R-0105, 30 Sep 2026; supersedes the canvas leg of R-0102).** Write once. Publish everywhere. A canon write made this session is settled when:

1. the authoritative CANON file is updated;
2. `CANON/CHANGELOG.md` records the change (Date | What changed, plain language | Ruling or file touched | Functions affected | Authorized by) — CHANGELOG.md is the authoritative persistent index of CANON changes;
3. each affected function receives a Slack notice in its channel (`#fn-business-ops`, `#fn-finance`, `#fn-sales-marketing`, `#fn-compliance`, `#fn-systems`) referencing the authoritative change;
4. any required handoff is recorded in `CANON/HANDOFFS.md`;
5. any failed publication or delivery attempt of steps 1–4 is recorded as an exception.

A Slack canvas is **optional presentation only**. Never treat a canvas write as required, and never fail a close because a canvas cannot be written. CANON is the source of truth; Slack is the notice layer, never a competing record.

Storage follows the **current approved architecture** (WorkDrive `05_OPERATIONS/CANON`, one master; Obsidian and Slack are read views). Do not recreate an older output-folder convention. Record where each thing went.

---

## Step 0 — Executive decision capture (mandatory, runs first)

Added 19 Oct 2026 on Damian's Standing Order, Executive Decision and Approval Management.

**Before closing a session, identify all unresolved matters requiring Damian's intervention. Check the Executive Decision & Approval Register and enter any missing requests into the correct business-function view in Notion. Preserve project references, priority, impact, and source evidence. Do not create duplicates. Then complete the normal session closeout process.**

Register (temporary staging): https://app.notion.com/p/86375bbe76304c7ebba44c19b37b78f1 — data source `collection://bfa1953e-d3e3-4273-a161-95e5814e4685`.

How to run it:

1. **List** every unresolved matter from this session that only Damian can decide or do: an approval, an access or credential step, a ruling, a new project or task, restoring archived work, reopening closed work, or an owner-only action.
2. **Check for duplicates** before writing. Query the register for open rows (Status not Closed, Denied or Verified) and compare by meaning, not exact wording: same ask, same project. If a row already covers the matter, do not add it. Note the existing ID instead. If the session adds new facts to an existing row, add them as a comment or a dated line in its Next Action, without changing its status.
3. **Enter each missing matter** as one row:
   - **Request**: the decision in one plain sentence, phrased as what Damian decides
   - **Function**: the owning function, which places it in that function's view (Business Operations, Systems & Automation, Sales & Marketing, Finance, Customer Service / MaryAlice, Legal & Compliance)
   - **Related Project** and **Project / Task**: the Zoho project or task reference (DK-number or ID) where one exists
   - **Priority**: Critical, High, Normal or Low
   - **Impact of Delay**: what stalls or what it costs while it waits
   - **Requested By**: the requesting agent or session, with its Session ID
   - **Submitted At**: date and time, Eastern
   - **Evidence**: a link to the source (handoff, commit, message, file); **Zoho Link** when the item lives in Zoho
   - **Decision Type** and **Decision Authority**: the closest options
   - **Status**: Submitted
   - **Reversal Plan**: how the change would be undone, when one applies
4. **Never** set a row to Approved, Denied, Modified or Closed. Damian decides at his reviews (1:00 AM and 7:00 AM Eastern, Monday to Friday).
5. **If the register cannot be reached**, record the access problem through Business Operations (its intake view, or a CANON HANDOFFS entry to Business Operations if Notion itself is down), list the uncaptured matters in Section 4, and continue the close. The close grade below counts this.
6. **Report** in the close: matters identified, rows added (with their IDs), matters already present (with the existing IDs), and anything not captured.

**Destination rule (temporary).** Notion is the staging register until Damian authorizes the move to Zoho Tables. Do not change the destination on your own initiative. When Damian authorizes the cutover, this step is updated to write to Zoho Tables, and the Notion instructions are removed.

---

## The session anchor

Every session has a stable identity tied to its business function and project. It goes at the **top** of the close, before anything else.

Required fields:

- **Session ID** — `[function code]-[YYYY-MM-DD]-[NN]`, e.g. `BO-2026-09-26-01`
- **Business function**
- **Project**
- **Opened** — date and time, ET
- **Closed** — date and time, ET (blank while OPEN)
- **Status** — OPEN, CLOSED, or CLOSED WITH EXCEPTION

At a successful close, set Status to **CLOSED** (or **CLOSED WITH EXCEPTION**, see Final Session Close) and fill in Closed. Directly under the anchor, print the control line:

> Control: This session has been processed. Do not continue operational work in this thread. Start a new session and resume from the durable handoff.

If the close does **not** pass (see Final Session Close), Status stays **OPEN** and the control line is replaced with the exceptions that block it.

In Mode A, write the anchor with the handoff record so the session-close control can find it. In Mode B, include it in the paste-ready block.

---

## The eight sections

Produce all eight, in this order, every time.

### 1. Stopping Point

One paragraph. **Where work actually stopped**, not what the session was about.

Answer precisely: what was mid-flight when the session ended, and what state is it in — finished, half-built, blocked, or abandoned?

> Bad: "We worked on the intake gate today."
> Good: "The eligibility gate spec is complete and approved. Nothing has been built in Guided Conversations yet. Two legal verifications block the customer-facing copy, and neither has started."

### 2. Completed This Session

Everything finished, with **evidence** — a file path, a record ID, a URL, a commit, a confirmation.

**Do not write an aspiration as a completion.** "Designed the approach for X" is not X being done. If it was drafted but not shipped, say drafted. This is the single most common way a handoff lies.

### 3. Decisions Closed

Decisions that must not be re-litigated. For each: **the ruling, one line of why, and the date.**

Only list a decision as closed if it genuinely is. A preference stated in passing is not a ruling.

→ **Writes to `CANON/DECISIONS.md`** (append-only, newest first).

### 4. Open Items and Blockers

Everything unresolved: bugs, unanswered questions, technical debt, pending approvals, missing credentials, dependencies on other people.

For each, name **who or what it is waiting on.** A blocker with no owner is not tracked, it is just noticed.

### 5. Handoffs

Anything another function or person must know because of what happened here.

Format each as: **→ Recipient · date · sender · what changed · what it blocks.**

→ **Writes to `CANON/HANDOFFS.md`** under OPEN. Move anything acted on this session to CLOSED rather than deleting it.

### 6. File Changes and Artifact Reconciliation

Account for **every material output produced or received during the session**: markdown, HTML, documents, code, exports, generated artifacts, supporting files, and anything else material.

For each one, state:

- **What it is** (plain language first, filename second)
- **Where it is permanently stored** (actual path or link)
- **Status**: CANON · CURRENT · STALE-OWNERSHIP · SUPERSEDED · REFERENCE — and for SUPERSEDED or STALE-OWNERSHIP, what superseded it and what it is still valid for
- **Action required**: none, or the specific action and who owns it

**STALE-OWNERSHIP is the important status** — the content is still valid and only the owner or numbering changed. Never mark something SUPERSEDED when its content survives.

**Filed means it is in its permanent location now.** An artifact whose action is "file when finalized" or "confirm filing" is **unfiled**, not filed. Count it that way.

Then report the totals:

- Outputs identified
- Outputs successfully filed
- Unfiled outputs (each named, with why and who will file it)
- Artifact exceptions (anything lost, unreachable, or of unknown location)

**Nothing material survives only inside the conversation or the temporary workspace.** Anything that cannot go to its permanent home yet goes to `CANON/INBOX/` with a one-line note — that counts as filed to INBOX, and says so.

→ **Writes to `CANON/SOURCES.md`.**

### 7. State Delta

Only what changed in the standing picture: architecture, priorities, dates, systems of record, known gaps.

**This is a snapshot, not a log.** If `STATE.md` grows past two pages, prune it — history belongs in `DECISIONS.md`.

→ **Writes to `CANON/STATE.md`.**

### 8. The Single Next Task

**One task. Not three, not a menu.** Name it, name its owner, and give one sentence of why it comes before anything else.

If the honest answer is that the next task depends on a decision only Damian can make, say that instead — and name the decision.

---

## Mandatory checks

Run all six before producing the handoff. State the result of each, even when clean.

**1. Reversals.** Does anything decided or built this session contradict an earlier decision? **Surface reversals explicitly.** Never let the most recent statement silently overwrite an earlier one. Say: *"This reverses [prior decision] from [date]. That was deliberate"* — or flag it as an accidental drift.

**2. Loose files.** Did anything arrive that was never routed — screenshots, exports, drafts, downloads? Anything unrouted goes to `CANON/INBOX/` with a one-line note. Never leave a file where it landed. The result must match the Section 6 totals.

**3. Work in another function's area.** Did work get done that belongs to another function? If so, say so plainly, and write the handoff so the right owner picks it up next time. Doing it once is fine. Doing it silently is how boundaries erode.

**4. Empty sections.** If nothing in a section changed, **say so explicitly**. Write "no canon changes" or "no decisions closed."

> **Silence is not the same as nothing changed.** An empty section reads as an oversight to whoever picks this up.

**5. Project Goal Alignment.** High priority. For **every active project touched** this session:

- Restate the project's current end goal, as currently recorded.
- Say whether this session's work moved the project toward that goal — yes, partly, or no, with one line of why.
- Name any scope drift, goal drift, unnecessary expansion, or work that no longer supports the intended outcome.
- If the goal is unclear, stale, or not precise enough, **flag it for refinement** and offer sharper wording as a suggestion.
- **Never silently redefine a project goal.** Damian decides whether a goal changes.

The purpose is to stop the system from efficiently executing work that has drifted away from the intended result.

**6. Executive decision capture.** Confirm Step 0 ran: every unresolved matter needing Damian appears in the register exactly once (new rows plus existing rows), or its access problem is recorded through Business Operations. Every item in Section 4 that waits on Damian must have a register ID next to it.

---

## Final Session Close

After the checks, grade the close:

- **Session reconciliation** — anchor complete, all eight sections present
- **Knowledge settlement** (R-0105) — decisions, handoffs, and state written (Mode A) or fully output (Mode B); for every canon write this session: the CANON file is updated, CHANGELOG.md records it, each affected `#fn-*` channel received a notice, and required handoffs are in HANDOFFS.md. A Slack canvas is never part of this grade.
- **Artifact settlement** — zero unfiled outputs and zero artifact exceptions
- **Goal alignment** — check run for every touched project; any drift is named and flagged
- **Decision capture** — Step 0 run; every matter needing Damian is in the register once, or its access problem is recorded through Business Operations

Each is PASS or FAIL. Then report **Unresolved close exceptions: [count]**.

- All PASS and zero exceptions → **SESSION STATUS: CLOSED**. Update the anchor.
- All PASS, and the only exceptions are recorded failed notice deliveries while the authoritative CANON and CHANGELOG state is settled → **SESSION STATUS: CLOSED WITH EXCEPTION**. List each exception and its owner.
- Anything else → **SESSION STATUS: OPEN — CLOSE FAILED**, list each exception with what it needs. Do not mark the session CLOSED. A goal flagged for refinement is not a failure by itself; unflagged drift is.

---

## Hard rules

- **Never narrate the session.** Nobody resuming work needs the story of how you got there.
- **Never restate what was already in the canon.** Only the delta.
- **Never mark something complete that was only planned.**
- **Never count an artifact as filed that is not in its permanent location.**
- **Never mark a session CLOSED with unresolved close exceptions** (CLOSED WITH EXCEPTION is the only allowed form, and only under the rule above).
- **Never treat a Slack canvas as required** (R-0105).
- **Never continue operational work in a CLOSED thread, and never re-close one** outside an explicit audit or recovery.
- **Never silently redefine a project goal.**
- **Never end with a menu.** Section 8 is one task.
- **Never skip a section.** Write "none" instead.
- **Never delete a handoff.** Move it to CLOSED. The log is how you see what keeps stalling.
- **Never close a session without decision capture** (Step 0), and never add a duplicate register row.

---

## Output shape

```
EXECUTIVE DECISION CAPTURE                           → Decision Register (Notion, temporary)
   Matters needing Damian identified: [n]
   Added:            [n — each with register ID and function]
   Already present:  [n — each with existing register ID]
   Not captured:     [none, or each with the access problem routed to Business Operations]

SESSION ANCHOR
  Session ID:        [e.g. BO-2026-09-26-01]
  Business Function: [function]
  Project:           [project]
  Opened:            [date, time ET]
  Closed:            [date, time ET]
  Status:            [CLOSED, CLOSED WITH EXCEPTION, or OPEN]
  Mode:              [A or B]

  Control: This session has been processed. Do not continue operational
  work in this thread. Start a new session and resume from the durable handoff.

1. STOPPING POINT
   [one paragraph]

2. COMPLETED THIS SESSION
   - [item] — evidence: [path, ID, URL] — status: complete

3. DECISIONS CLOSED                                  → DECISIONS.md
   - [date] — [ruling] — why: [one line]

4. OPEN ITEMS AND BLOCKERS
   - [item] — waiting on: [who or what] — register: [ID, when it waits on Damian]

5. HANDOFFS                                          → HANDOFFS.md
   → [Recipient] · [date] · from [sender] · [what changed] · blocks: [what]

6. FILE CHANGES / ARTIFACT RECONCILIATION            → SOURCES.md
   | What it is | Permanent location | Status | Action required |
   |---|---|---|---|
   | [plain description] ([filename]) | [path or link] | [status; superseded by / still valid for, if relevant] | [none, or action + owner] |

   Outputs identified:          [n]
   Outputs successfully filed:  [n]
   Unfiled outputs:             [n — each named, with owner]
   Artifact exceptions:         [none, or each named]

7. STATE DELTA                                       → STATE.md
   - [what changed in the standing picture]

8. THE SINGLE NEXT TASK
   [one task] — owner: [function] — because: [one sentence]

MANDATORY CONTROL CHECKS
   Reversals:                       [none, or named with prior decision and date]
   Loose files:                     [none, or routed to INBOX]
   Work in another function's area: [none, or named]
   Empty sections:                  [none, or which were written as "none"]
   Project Goal Alignment:
     [Project] — goal: [current end goal]
       Moved toward goal: [yes / partly / no] — [one line]
       Drift:             [none, or named]
       Goal wording:      [fine, or flagged — suggested sharper wording]

FINAL SESSION CLOSE
   Session reconciliation:  [PASS/FAIL]
   Knowledge settlement:    [PASS/FAIL]
   Artifact settlement:     [PASS/FAIL]
   Goal alignment:          [PASS/FAIL]
   Decision capture:        [PASS/FAIL]
   Unresolved close exceptions: [n]

SESSION STATUS: [CLOSED | CLOSED WITH EXCEPTION | OPEN — CLOSE FAILED]
[If CLOSED:] Do not continue operational work in this thread. New work must
begin in a new session using the durable handoff state.
[If CLOSED WITH EXCEPTION:] each recorded exception and its owner.
[If OPEN:] [each exception and what it needs]
```

---

## When to reach for something else

- Reconstructing a project **somewhere new** → Project Rebuild Summary Prompt.
- Picking work back up → **Resume This Project** prompt. This skill is what makes that one worth running.
- Work spanning several separate conversations → run a conversation search first, so sections 2 and 3 draw on the full history rather than only this session.
- Closing **many** sessions at the end of an operating period → the external session-close control, which calls this skill once per session.