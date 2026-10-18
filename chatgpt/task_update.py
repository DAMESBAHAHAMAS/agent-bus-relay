"""Write a delegated run's results back to ITS OWN Zoho Projects task. Called by the Mac bridge, never by the model.

Usage: task_update.py <project_id> <task_id>   with one JSON object on stdin:
  {"cid": "...", "comment": "...", "fields": {...}, "issues": [{"title": "...", "description": "..."}]}
Prints one JSON result. Never prints a token.

Bounds, in code:
- Only this task, only inside the existing Projects fence (backend POLICY; never Personal), only while the task is open.
- Fields: the Execution Tracking section only. definition_of_done, evidence_required and execution_actor are SET ONLY IF EMPTY
  (they are Damian's acceptance criteria and assignment); resume_context, next_activity and next_activity_date may be updated.
  Never name, description, status, owners, dates, completion or any other field. Every field write is read back.
- One comment per run, labeled with the correlation id. At most 3 issues, each referencing the task and correlation id.
- No delete: the adapter's Projects call refuses every method except GET, POST and PATCH.
"""
import sys
sys.dont_write_bytecode = True
import datetime, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "dispatch"
sys.path.insert(0, str(ROOT))

TEXT = ("definition_of_done", "evidence_required", "resume_context", "next_activity")
SET_ONCE = ("definition_of_done", "evidence_required", "execution_actor")
# Execution Actor picklist values, exactly as configured in Zoho (field 1156860000009143012), read 2026-10-18.
ACTORS = ("Claude", "Damian", "Arsalan", "Muse", "Claude Code", "SysAuto", "SalesM", "Finance", "Codex", "GPT", "Mary Alice",
          "Biz Operations", "Compliance", "OpenClaw Agent", "Other", "Notebook")
LABEL = "[Claude Code, delegated by ChatGPT for Damian, {cid}]"


def clean(fields):
    """Keep only allowed, well-formed field values."""
    out, dropped = {}, []
    for k, v in (fields or {}).items():
        if k in TEXT and isinstance(v, str) and v.strip():
            out[k] = v.strip()[:1000]
        elif k == "next_activity_date" and isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            try:
                datetime.date.fromisoformat(v); out[k] = v
            except ValueError:
                dropped.append(k)
        elif k == "execution_actor" and v in ACTORS:
            out[k] = v
        else:
            dropped.append(k)
    return out, dropped


def current(task, k):
    v = task.get(k)
    if isinstance(v, dict):
        v = v.get("value") or v.get("name")
    return v if v not in (None, "", []) else None


def run(adapter, control, pid, tid, req):
    cid = str(req.get("cid") or "")[:60]
    result = {"ok": True, "project_id": pid, "task_id": tid, "fields_written": [], "fields_skipped": [], "comment": None, "issues": []}
    if not adapter.project_allowed(pid):
        return {"ok": False, "reason": "project_outside_system_of_record_fence"}
    path = f"projects/{pid}/tasks/{tid}"
    task = control.record(adapter.read("project_task", {"project_id": pid, "task_id": tid}))
    if not isinstance(task, dict) or str(task.get("id")) != tid:
        return {"ok": False, "reason": "task_not_found"}
    if control.closed(task):
        return {"ok": False, "reason": "task_closed"}

    fields, dropped = clean(req.get("fields"))
    result["fields_skipped"] += [{"field": k, "why": "not allowed or malformed"} for k in dropped]
    for k in list(fields):
        if k in SET_ONCE and current(task, k) is not None:
            result["fields_skipped"].append({"field": k, "why": "already set; only Damian changes it"})
            del fields[k]
    if fields:
        try:
            adapter.projects("PATCH", path, fields)
            after = control.record(adapter.read("project_task", {"project_id": pid, "task_id": tid}))
            for k, v in fields.items():
                got = current(after, k)
                # Text is compared on its start (Zoho may normalize whitespace); a picklist or date only has to be present.
                if got is not None and (k not in TEXT or str(got).strip()[:40] == v[:40]):
                    result["fields_written"].append(k)
                else:
                    result["ok"] = False
                    result["fields_skipped"].append({"field": k, "why": "read-back did not show the value"})
        except Exception as e:
            result["ok"] = False
            result["fields_skipped"].append({"field": ",".join(fields), "why": "write failed: " + str(e)[:160]})

    comment = str(req.get("comment") or "").strip()
    if comment:
        try:
            r = adapter.projects("POST", path + "/comments", {"comment": (LABEL.format(cid=cid) + "\n" + comment)[:4000]})
            result["comment"] = "posted" if r is not None else "unknown"
        except Exception as e:
            result["ok"] = False; result["comment"] = "failed: " + str(e)[:160]

    for issue in (req.get("issues") or [])[:3]:
        title = str((issue or {}).get("title") or "").strip()[:200]
        if not title:
            continue
        body = str(issue.get("description") or "").strip()[:3500] + f"\n\nRaised by Claude Code while working task {tid} ({cid})."
        try:
            r = adapter.projects("POST", f"projects/{pid}/issues", {"name": title, "description": body})
            iid = None
            for x in (r if isinstance(r, list) else (r or {}).get("issues") or [r or {}]):
                iid = iid or (x or {}).get("id")
            result["issues"].append({"title": title, "id": str(iid) if iid else None})
        except Exception as e:
            result["ok"] = False; result["issues"].append({"title": title, "error": str(e)[:160]})
    return result


def main():
    if len(sys.argv) != 3 or not all(re.fullmatch(r"\d{6,25}", a) for a in sys.argv[1:]):
        print(json.dumps({"ok": False, "reason": "bad_arguments"})); return
    try:
        req = json.loads(sys.stdin.read() or "{}")
        import control
        from backend import Adapter
        print(json.dumps(run(Adapter("bizops"), control, sys.argv[1], sys.argv[2], req)))
    except Exception as e:
        print(json.dumps({"ok": False, "reason": "update_failed: " + type(e).__name__}))


if __name__ == "__main__":
    main()
