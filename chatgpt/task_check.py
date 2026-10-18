"""Read one Zoho Projects task for a delegated ChatGPT request. Read-only, through the existing fenced adapter.

Usage: task_check.py <project_id> <task_id>   Prints one JSON object. Never prints a token.
The project must be inside the existing Projects fence (backend POLICY, never Personal) and the task must exist.
"""
import sys
sys.dont_write_bytecode = True
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent / "dispatch"
sys.path.insert(0, str(ROOT))


def out(**kw):
    print(json.dumps(kw))
    sys.exit(0)


def main():
    if len(sys.argv) != 3 or not all(re.fullmatch(r"\d{6,25}", a) for a in sys.argv[1:]):
        out(ok=False, reason="bad_arguments")
    pid, tid = sys.argv[1], sys.argv[2]
    try:
        import control
        from backend import Adapter
        a = Adapter("bizops")
        if not a.project_allowed(pid):
            out(ok=False, reason="project_outside_system_of_record_fence")
        t = control.record(a.read("project_task", {"project_id": pid, "task_id": tid}))
        project = a.projects("GET", "projects/" + pid)
        ps = project if isinstance(project, list) else project.get("projects", [project])
        pname = (ps[0] or {}).get("name", "") if ps else ""
    except PermissionError:
        out(ok=False, reason="project_outside_system_of_record_fence")
    except Exception as e:
        out(ok=False, reason="task_not_found_or_unreadable")
    if not isinstance(t, dict) or str(t.get("id")) != tid:
        out(ok=False, reason="task_not_found")
    status = (t.get("status") or {}).get("name") if isinstance(t.get("status"), dict) else t.get("status")
    milestone = t.get("milestone")
    out(ok=True, project_id=pid, project_name=pname, task_id=tid, name=t.get("name", ""), status=status or "",
        open=not control.closed(t), milestone=(milestone.get("name") if isinstance(milestone, dict) else milestone) or "",
        description=control.plain(t.get("description") or "")[:4000])


main()
