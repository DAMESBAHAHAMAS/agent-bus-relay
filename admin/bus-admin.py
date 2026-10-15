#!/usr/bin/env python3
# bus-admin.py -- Damian's control panel for the agent bus. Prints names and statuses only, never key values.
#
#   bus-admin.py status              is everything up, and is anything waiting?
#   bus-admin.py pending             requests that have not been acknowledged
#   bus-admin.py audit               the last 40 events: what was carried, what was refused
#   bus-admin.py cutoff <agent>      cut one agent off (its key stops working after the redeploy, about a minute)
#   bus-admin.py restore <agent>     let a cut-off agent back in
#   bus-admin.py shutdown            suspend the relay: every agent is cut off at once
#   bus-admin.py resume              bring the relay back
#   bus-admin.py sync                re-install keys and rules on the relay and redeploy
import subprocess, json, urllib.request, urllib.error, getpass, secrets, sys, os, time, datetime
USER = getpass.getuser()
BASE = "https://agent-bus-relay.onrender.com"
SERVICE = "agent-bus-relay"
AGENTS = ["bizops", "finance", "salesmkt", "systems", "compliance", "codedev",
          "claude-code", "zia-projects", "gpt",
          "claude-bizops", "claude-finance", "claude-salesmkt", "claude-systems", "claude-compliance",
          "maryalice", "muse", "ops"]
EXTERNAL = ["muse", "gpt"]
CUT_FILE = os.path.expanduser("~/.agent-bus/cutoff.json")

def kc(name):
    return subprocess.run(["security", "find-generic-password", "-a", USER, "-s", name, "-w"], capture_output=True, text=True).stdout.strip()
def kc_set(name, value):
    subprocess.run(["security", "-i"], input='add-generic-password -U -a "%s" -s "%s" -w "%s"\n' % (USER, name, value), text=True, capture_output=True)
def http(method, url, headers, body=None, timeout=60):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=dict(headers, **{"Content-Type": "application/json", "Accept": "application/json"}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, {"raw": raw[:200]}
    except Exception as e:
        return 0, {"error": str(e)[:120]}
def render(method, path, body=None):
    return http(method, "https://api.render.com/v1" + path, {"Authorization": "Bearer " + kc("render-api-key")}, body)
def relay(path, method="GET"):
    return http(method, BASE + path, {"Authorization": "Bearer " + kc("agent-bus-key-ops")}, None, 30)
def service_id():
    for attempt in range(4):
        code, found = render("GET", "/services?name=%s&limit=5" % SERVICE)
        if code == 200 and found: return found[0]["service"]["id"], found[0]["service"]
        time.sleep(2 + attempt * 2)
    raise RuntimeError("Render did not return the service (HTTP %s)" % code)
def cut_list():
    try: return json.load(open(CUT_FILE))
    except Exception: return []
def save_cut(l):
    os.makedirs(os.path.dirname(CUT_FILE), exist_ok=True); json.dump(sorted(set(l)), open(CUT_FILE, "w"))
def when(ms):
    return datetime.datetime.fromtimestamp(ms / 1000).strftime("%b %d %H:%M:%S")

def sync(deploy=True):
    for a in AGENTS:
        if not kc("agent-bus-key-" + a): kc_set("agent-bus-key-" + a, secrets.token_hex(24))
    if not kc("agent-bus-signing-secret"): kc_set("agent-bus-signing-secret", secrets.token_hex(32))
    cut = cut_list()
    active = [a for a in AGENTS if a not in cut]
    sid, _ = service_id()
    values = {"SERVICE_KEYS": ",".join("%s:%s" % (a, kc("agent-bus-key-" + a)) for a in active), "EXTERNAL_AGENTS": ",".join(EXTERNAL), "FRONT_DOOR": "bizops",
              "ADMIN_AGENTS": "ops", "BUS_SIGNING_SECRET": kc("agent-bus-signing-secret"), "ACK_REMIND_S": "120", "ACK_ESCALATE_S": "600", "HOP_LIMIT": "30",
              "ALERT_BOT": "agentbus", "ALERT_USER_IDS": kc("agent-bus-alert-user-ids")}
    bad = [k for k, v in values.items() if not v]
    if bad: sys.exit("STOPPED: missing value for %s" % bad)
    for k, v in values.items():
        for attempt in range(4):
            code, _ = render("PUT", "/services/%s/env-vars/%s" % (sid, k), {"value": v})
            if code == 200: break
            time.sleep(3 + attempt * 3)
        if code != 200: sys.exit("STOPPED: could not set %s (HTTP %s)" % (k, code))
    print("Agents allowed on the bus: " + ", ".join(active))
    if cut: print("Cut off: " + ", ".join(cut))
    if deploy:
        for attempt in range(4):
            code, d = render("POST", "/services/%s/deploys" % sid, {"clearCache": "do_not_clear"})
            if code in (200, 201, 202) and d.get("id"): break
            time.sleep(3 + attempt * 3)
        did = d.get("id", "")
        if not did: sys.exit("STOPPED: Render did not start the redeploy (HTTP %s). The key change is saved and takes effect at the next deploy." % code)
        print("Redeploying the relay...")
        for _ in range(40):
            code, dd = render("GET", "/services/%s/deploys/%s" % (sid, did))
            if dd.get("status") in ("live", "build_failed", "update_failed", "canceled"): break
            time.sleep(4)
        print("Deploy status: %s" % dd.get("status"))

def status():
    sid, svc = service_id()
    print("Relay service on Render: %s (%s)" % (svc.get("suspended", "?").replace("not_suspended", "running"), sid))
    code, h = http("GET", BASE + "/healthz", {}, None, 15)
    print("Relay health: %s" % ("up, version %s, configured %s" % (h.get("version"), h.get("configured")) if code == 200 else "NOT RESPONDING (HTTP %s)" % code))
    b = subprocess.run(["pgrep", "-f", "bus-bridge.js"], capture_output=True, text=True).stdout.strip()
    print("Mac bridge (wakes your agents): %s" % ("running" if b else "NOT RUNNING"))
    code, a = relay("/audit")
    if code == 200:
        pend = [r for r in a["ledger"] if r["state"] != "acknowledged"]
        print("New agent-started messages in the past hour with no person posting: %s of %s allowed" % (a["hops_since_human"], a["hop_limit"]))
        print("Requests not yet acknowledged: %d" % len(pend))
        for r in pend: print("   %s -> %s | %s | waiting %ss | id %s" % (r["from"], r["to"], r["state"], r["waiting_seconds"], r["correlation_id"]))
    cut = cut_list()
    print("Agents cut off: %s" % (", ".join(cut) if cut else "none"))

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    arg = sys.argv[2] if len(sys.argv) > 2 else ""
    if cmd == "status": status()
    elif cmd == "pending":
        code, p = relay("/pending")
        rows = p.get("pending", [])
        print("Nothing is waiting." if not rows else "\n".join("%s -> %s | %s | waiting %ss | id %s" % (r["from"], r["to"], r["state"], r["waiting_seconds"], r["correlation_id"]) for r in rows))
    elif cmd == "audit":
        code, a = relay("/audit")
        for e in a.get("events", [])[-40:]:
            print("%s | %-12s | %s" % (when(e["at"]), e["kind"], " ".join("%s=%s" % (k, v) for k, v in e.items() if k not in ("at", "kind"))))
    elif cmd in ("cutoff", "restore"):
        if arg not in AGENTS: sys.exit("Name one of: " + ", ".join(AGENTS))
        cut = cut_list()
        cut = [a for a in cut if a != arg] + ([arg] if cmd == "cutoff" else [])
        # Step 1 takes effect at once on the running relay. Step 2 removes or restores the key itself, which survives restarts.
        code, r = relay("/admin/%s?agent=%s" % (cmd, arg), "POST")
        print(("%s is cut off now." % arg if cmd == "cutoff" else "%s is restored on the running relay." % arg) if code == 200 else ("The running relay did not confirm (HTTP %s). Continuing with the key change." % code if cmd == "cutoff" else "Restoring the key."))
        save_cut(cut); sync(True)
    elif cmd in ("shutdown", "resume"):
        # Render's API can refuse or time out for a moment. Keep trying, then confirm the real state before reporting.
        want = "suspended" if cmd == "shutdown" else "not_suspended"
        state, code = "?", 0
        for attempt in range(8):
            try:
                sid, svc = service_id()
                state = svc.get("suspended", "?")
                if state == want: break
                code, _ = render("POST", "/services/%s/%s" % (sid, "suspend" if cmd == "shutdown" else "resume"))
            except Exception:
                code = 0
            time.sleep(2 + attempt * 2)
        if state != want:
            try: state = service_id()[1].get("suspended", "?")
            except Exception: pass
        if state == want:
            print("Relay suspended. Every agent is cut off." if cmd == "shutdown" else "Relay resuming. Allow about three minutes.")
        else:
            print("NOT CONFIRMED: Render did not accept the %s command (last HTTP %s). Open the Render dashboard, service agent-bus-relay, and press %s." % (cmd, code, "Suspend Service" if cmd == "shutdown" else "Resume Service"))
            sys.exit(1)
    elif cmd == "sync": sync(True)
    else: print(__doc__ or "see the comments at the top of this file")
main()
