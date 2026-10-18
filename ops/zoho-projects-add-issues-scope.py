#!/usr/bin/env python3
"""Re-authorize the agents' Zoho Projects credential (~/.zoho/projects.env) to ALSO create and read issues.

Approved by Damian 2026-10-18. Uses a SERVER-BASED Zoho client (never the Self Client), so no Self Client token is touched.
Run it yourself in Terminal on the Mac:
    python3 -I ops/zoho-projects-add-issues-scope.py              # use the client already in projects.env
    python3 -I ops/zoho-projects-add-issues-scope.py --new-client # switch the agents to a new server-based client
The client must list this Authorized Redirect URI exactly:  http://localhost:8765/callback
It opens Zoho's consent page in your browser; you click Accept; the reply comes back to this Mac only (127.0.0.1:8765).
It checks the new token keeps every existing scope plus the two issue scopes, backs up the old file (mode 600), writes the new
values, verifies them, and expires the adapter's cached access token. It never prints a secret. On any failure nothing changes.
"""
import datetime, getpass, http.server, json, os, secrets, shutil, sys, threading, urllib.error, urllib.parse, urllib.request, webbrowser

PATH = os.path.expanduser("~/.zoho/projects.env")
CACHE = os.path.expanduser("~/.openclaw/cache/business-functions-direct/projects-access-token.json")
REDIRECT = "http://localhost:8765/callback"
ACCOUNTS = "https://accounts.zoho.com"
KEEP = {"ZohoProjects.tasks.ALL", "ZohoProjects.tasklists.ALL", "ZohoProjects.projects.READ"}
ADD = {"ZohoProjects.bugs.CREATE", "ZohoProjects.bugs.READ"}


def token_call(fields):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(ACCOUNTS + "/oauth/v2/token", data=urllib.parse.urlencode(fields).encode()), timeout=30))
    except urllib.error.HTTPError as e:
        return {"error": "HTTP %s" % e.code}


def wait_for_code(state):
    got = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            ok = urllib.parse.urlparse(self.path).path == "/callback" and q.get("state", [""])[0] == state and "code" in q
            if ok:
                got["code"] = q["code"][0]
            elif "error" in q:
                got["error"] = q["error"][0]
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.end_headers()
            self.wfile.write(b"Done. You can close this tab and return to Terminal." if ok else b"Not accepted. Return to Terminal.")

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 8765), Handler)
    srv.timeout = 1
    deadline = datetime.datetime.now() + datetime.timedelta(minutes=5)
    while not got and datetime.datetime.now() < deadline:
        srv.handle_request()
    srv.server_close()
    return got


def main():
    lines = open(PATH).read().splitlines()
    env = dict(l.split("=", 1) for l in lines if "=" in l and not l.startswith("#"))
    if "--new-client" in sys.argv:
        cid = input("New server-based Client ID: ").strip()
        csec = getpass.getpass("New Client Secret (hidden): ").strip()
    else:
        cid, csec = env["ZOHO_CLIENT_ID"], env["ZOHO_CLIENT_SECRET"]
        print("Using the client already in projects.env (ID ending %s). It must list %s as a redirect URI." % (cid[-6:], REDIRECT))
    if not cid or not csec:
        sys.exit("Client ID and secret are required. Nothing changed.")
    state = secrets.token_urlsafe(24)
    url = ACCOUNTS + "/oauth/v2/auth?" + urllib.parse.urlencode({"scope": ",".join(sorted(KEEP | ADD)), "client_id": cid, "response_type": "code",
        "access_type": "offline", "prompt": "consent", "redirect_uri": REDIRECT, "state": state})
    print("Opening Zoho's consent page. Check it lists Zoho Projects tasks, task lists, projects (read) and bugs/issues (create, read), then Accept.")
    print("If the browser does not open, paste this address into it:\n  " + url + "\n")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    got = wait_for_code(state)
    if not got.get("code"):
        sys.exit("No approval received (%s). Nothing changed." % (got.get("error") or "timed out after 5 minutes"))
    r = token_call({"grant_type": "authorization_code", "code": got["code"], "client_id": cid, "client_secret": csec, "redirect_uri": REDIRECT})
    new = r.get("refresh_token")
    granted = set((r.get("scope") or "").replace(",", " ").split())
    if not new:
        sys.exit("Zoho did not return a refresh token (%s). Nothing changed." % (r.get("error") or "no token"))
    missing = (KEEP | ADD) - granted if granted else set()
    if missing:
        sys.exit("The new token is missing: %s. Nothing changed." % ", ".join(sorted(missing)))
    check = token_call({"refresh_token": new, "client_id": cid, "client_secret": csec, "grant_type": "refresh_token"})
    if not check.get("access_token"):
        sys.exit("The new token did not refresh. Nothing changed.")
    backup = PATH + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(PATH, backup); os.chmod(backup, 0o600)
    values = {"ZOHO_REFRESH_TOKEN": new, "ZOHO_CLIENT_ID": cid, "ZOHO_CLIENT_SECRET": csec}
    out = [(k + "=" + values[k]) if (k := l.split("=", 1)[0]) in values and "=" in l else l for l in lines]
    tmp = PATH + ".tmp"
    with open(tmp, "w") as f:
        f.write("\n".join(out) + "\n")
    os.chmod(tmp, 0o600); os.replace(tmp, PATH)
    if os.path.exists(CACHE):   # the adapter caches an access token ~58 minutes; expire it so the new scopes apply now
        with open(CACHE + ".tmp", "w") as f:
            json.dump({"expires_at": 0, "source": "expired after adding issue scopes"}, f)
        os.chmod(CACHE + ".tmp", 0o600); os.replace(CACHE + ".tmp", CACHE)
    print("Done. Scopes now:", check.get("scope") or " ".join(sorted(granted)))
    print("Old file kept at", backup, "(mode 600). The previous token still works until you revoke it in the API Console.")


if __name__ == "__main__":
    main()
