#!/usr/bin/env python3
"""Create a Zoho credential for Mary-Alice (OpenClaw main): Keychain item "zoho-maryalice-<preset>".

Damian's decision, 19 Oct 2026 (Option B): Mary-Alice sends on her own as him. Same server-based client and localhost consent
flow as zoho-finance-books-read.py. Run it yourself in Terminal on the Mac, once per preset:
    python3 -I ops/zoho-maryalice-consent.py mail     # Zoho Mail: read accounts, folders, messages; send and reply
    python3 -I ops/zoho-maryalice-consent.py crm      # Zoho CRM: read, create, update every module; NO delete scope
It opens Zoho's consent page; click Accept. The reply comes back to this Mac only (127.0.0.1:8765). It proves the token with
one read call, then stores it in the login Keychain. It never prints a secret. On any failure nothing is stored.
"""
import datetime, http.server, json, os, secrets, subprocess, sys, threading, urllib.error, urllib.parse, urllib.request, webbrowser

ENV = os.path.expanduser("~/.zoho/projects.env")      # only the client id and secret are read from here
REDIRECT = "http://localhost:8765/callback"
ACCOUNTS = "https://accounts.zoho.com"
PRESETS = {
    "mail": {"scopes": ["ZohoMail.accounts.READ", "ZohoMail.folders.READ", "ZohoMail.messages.READ", "ZohoMail.messages.CREATE"],
             "check": "https://mail.zoho.com/api/accounts", "what": "your Zoho Mail accounts",
             "says": "read your mail accounts, folders and messages, and send mail"},
    "crm": {"scopes": ["ZohoCRM.modules.READ", "ZohoCRM.modules.CREATE", "ZohoCRM.modules.UPDATE",
                       "ZohoCRM.settings.READ", "ZohoCRM.users.READ", "ZohoCRM.org.READ"],
            "check": "https://www.zohoapis.com/crm/v8/org", "what": "your CRM organization",
            "says": "read, create and update CRM records (no delete), and read CRM settings, users and org"},
}


def post(url, fields):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode()), timeout=30))
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
    preset = sys.argv[1] if len(sys.argv) > 1 else ""
    if preset not in PRESETS:
        sys.exit("Name one of: " + ", ".join(PRESETS) + ". Nothing stored.")
    p = PRESETS[preset]
    service = "zoho-maryalice-" + preset
    env = dict(l.split("=", 1) for l in open(ENV).read().splitlines() if "=" in l and not l.startswith("#"))
    cid, csec = env.get("ZOHO_CLIENT_ID", "").strip(), env.get("ZOHO_CLIENT_SECRET", "").strip()
    if not cid or not csec:
        sys.exit("No client id/secret in %s. Nothing stored." % ENV)
    print("Using the Zoho client already in projects.env (ID ending %s)." % cid[-6:])
    state = secrets.token_urlsafe(24)
    url = ACCOUNTS + "/oauth/v2/auth?" + urllib.parse.urlencode({"scope": ",".join(p["scopes"]), "client_id": cid, "response_type": "code",
        "access_type": "offline", "prompt": "consent", "redirect_uri": REDIRECT, "state": state})
    print("Opening Zoho's consent page. It should ask to %s. Click Accept." % p["says"])
    print("If the browser does not open, paste this address into it:\n  " + url + "\n")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    got = wait_for_code(state)
    if not got.get("code"):
        sys.exit("No approval received (%s). Nothing stored." % (got.get("error") or "timed out after 5 minutes"))
    r = post(ACCOUNTS + "/oauth/v2/token", {"grant_type": "authorization_code", "code": got["code"], "client_id": cid,
                                            "client_secret": csec, "redirect_uri": REDIRECT})
    refresh, access = r.get("refresh_token"), r.get("access_token")
    if not refresh or not access:
        sys.exit("Zoho did not return a token (%s). Nothing stored." % (r.get("error") or "no token"))
    req = urllib.request.Request(p["check"], headers={"Authorization": "Zoho-oauthtoken " + access})
    try:
        code = urllib.request.urlopen(req, timeout=30).status
    except urllib.error.HTTPError as e:
        code = e.code
    if code != 200:
        sys.exit("Read test failed on %s: HTTP %s. Nothing stored." % (p["what"], code))
    print("Read test passed:", p["what"], "(HTTP 200)")
    value = json.dumps({"client_id": cid, "client_secret": csec, "refresh_token": refresh, "accounts_url": ACCOUNTS,
                        "scopes": p["scopes"], "created": datetime.datetime.now().isoformat(timespec="seconds")})
    res = subprocess.run(["/usr/bin/security", "add-generic-password", "-U", "-s", service, "-a", "maryalice", "-w", value],
                         capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit("Could not store in Keychain (%s). Nothing stored." % res.stderr.strip()[:120])
    print('Done. Stored in Keychain as service "%s", account "maryalice". Scopes: %s' % (service, ", ".join(p["scopes"])))


if __name__ == "__main__":
    main()
