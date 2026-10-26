# Path 2: headless Claude Code execution for GPT (2026-10-26)

## What already existed
GPT's `delegate_task` (relay, `CHATGPT_DELEGATION_ENABLED=1`) -> `claude-code` on the bus -> `chatgpt/executor.js` on the Mac.
The task is read from Zoho Projects by the bridge. Claude runs with `--permission-mode dontAsk` and only `chatgpt/executor-settings.json`. Runs succeeded on 18-19 Oct.
GPT's `ask_claude_code` still goes to the tool-less reply. That is by design.

## Gaps found (reproduced, not inferred)
1. **Command shape.** `node --test <relative>` and `cd … && …` are denied. `node --test /abs/path` is allowed (probe A).
   The fix is the prompt line "absolute paths, no compound commands". Another session found it first, and its run reached 21/21 and STATUS: COMPLETE.
2. **No repository work was possible.** The executor's cwd is `~/.agent-bus/exec/<task>`, and `git -C <repo> status` is denied (probe C), because rules match on the command prefix. With `cd` also denied, the "commit on a chatgpt/ branch" path could never work.
3. **No push was possible.** `Bash(git push -u origin chatgpt/:*)` does not match `git push -u origin chatgpt/<id>-<name>`. A real run was denied.

## Change (branch `path2/headless-exec`)
- `delegate_task` takes an optional `repo`: a folder name under ~/Developer.
  It is validated at the relay and again on the Mac. `agent-bus-relay*` is refused, because its worktree would sit outside the relay's Edit/Write deny rule.
- The bridge creates a worktree at `~/.agent-bus/exec/<task>/<repo>` on `chatgpt/<task_id>-<slug>`, forked from `origin/HEAD`. A retry reuses it.
  The model runs inside the worktree, so the existing narrow `git status/add/commit` rules apply. Damian's live checkouts are not touched.
- The bridge pushes exactly that branch (`refs/heads/X:refs/heads/X`, no force), and only when there are commits. The model is told not to push.
- Every result ends with **BRIDGE-VERIFIED EVIDENCE**, checked by the bridge after the run:
  - repo runs: branch and head, commits since the fork point, clean or dirty working tree, and whether the remote head matches
  - non-repo runs: the deliverables with their sizes and sha256
- `executor-settings.json` is **unchanged**. No permission was widened.

## Evidence
- `node --test chatgpt/test/executor.test.js`: 7/7 pass. It covers validation, refusal of the relay repo, worktree and branch, push, retry from the fork point, a folder that is not a repo, deliverable hashes, and a failed run.
- `node --test chatgpt/test/local.test.js`: 20 pass, 0 fail, 1 skipped (the MCP SDK client test needs `welcomeiq/node_modules`).
- Real end-to-end run: the real executor and the real `claude -p` (sonnet, dontAsk, executor-settings.json) on a throwaway repo with a local bare origin. Zoho was stubbed and posts were printed.
  - Run 1, before the bridge push: the model edited, tested (1/1) and committed `bd85af1`. The push was denied. The bridge evidence said "pushed: no", and the model reported BLOCKED honestly.
  - Run 2, the same task as a recovery: the worktree was reused, 1 commit was counted from the fork point, and the bridge pushed. STATUS: COMPLETE.
  - Independent check: origin has `chatgpt/9990000000000002-fix-add-bug` at bd85af1, origin main is unmoved (c28c78f), and the live checkout is still on main with the original code.

## Not done (needs coordination or Damian)
- Not merged and not deployed. The live bridge was not restarted.
- The bridge needs a restart to load the new executor. The relay needs a deploy for GPT to see `repo` on `delegate_task`.
- Main has an uncommitted `chatgpt/executor.js` edit from another session (the same absolute-path line, included here word for word).
- No live GPT -> relay -> bridge run of a repo task yet. Do one after the merge.

## Integration and live acceptance (2026-10-26)
- Rebased on 9e6a695 (Path 1's absolute-path line, kept once) and merged as 148fd3b after Path 1 (session agent-bus-relay-18) cleared it. Render deployed the relay (dep-dbfijcijnfac73eqbc50, live 10:22:06Z, as reported by Path 1).
- Found live: the relay's Luhn card filter refused posts quoting 19-digit Zoho ids (HTTP 422 at 10:21Z and 10:23Z). Path 1's 5462d6e masks only the run's own ids in posted text; the filter is unchanged. The bridge restarted at 10:29:35Z on 5462d6e.
- Run 1, cgpt-94fc79bbcc6b2cf80b8a (11:15Z): GPT's call carried no `repo` because ChatGPT's tool list was stale. The run correctly reported BLOCKED with no edits. Fixed by refreshing the app in ChatGPT.
- Run 2, cgpt-2c636e94f4a1f620ae6b (11:23:56-11:24:30Z), Zoho SA5-T127, repo path2-acceptance: STATUS: COMPLETE.
  - Origin branch `chatgpt/<task_id>-path-2-live-acceptance-gpt-delegate-task` is at 77f898a, one commit on ae60748, and changes slugify.js only.
  - Independent check: a fresh clone of the pushed branch passes 2/2. Origin main is still ae60748, and the live checkout is on main and clean.
  - The bridge evidence reported 1 commit, a clean tree, and "pushed to origin: yes, remote head matches". The ack and result were posted with no 422.
