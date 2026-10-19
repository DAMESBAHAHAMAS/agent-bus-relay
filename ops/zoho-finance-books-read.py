#!/usr/bin/env python3
"""Create the read-only Zoho Books credential for OpenClaw finance: Keychain item "zoho-finance-books-read".

Finance Phase 1 gap G1 (19 Oct 2026): Books banking and accountants READ, so the 04:00/16:00 close can run its balance test.
Read-only by scope: it can't write, change or delete anything in Books.
Uses the same SERVER-BASED Zoho client as ~/.zoho/projects.env (never the Self Client). Run it yourself in Terminal on the Mac:
    python3 -I ops/zoho-finance-books-read.py
It opens Zoho's consent page in your browser. Pick the organization 702999686 if asked, then click Accept. The reply comes back
to this Mac only (127.0.0.1:8765). It proves the token reads bank accounts and the chart of accounts for org 702999686, then
stores it in the login Keychain. It never prints a secret. On any failure nothing is stored.
"""
import datetime, http.server, json, os, secrets, subprocess, sys, threading, urllib.error, urllib.parse, urllib.request, webbrowser

ENV = os.path.expanduser("~/.zoho/projects.env")      # only the client id and secret are read from here
SERVICE, ACCOUNT = "zoho-finance-books-read", "finance"
REDIRECT = "http://localhost:8765/callback"
ACCOUNTS, API = "https://accounts.zoho.com", "https://www.zohoapis.com/books/v3"
ORG = "702999686"                                     # Books organization of record (ruling 15 Oct 2026)
SCOPES = ["ZohoBooks.banking.READ", "ZohoBooks.accountants.READ", "ZohoBooks.settings.READ"]


def post(url, fields):
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode()), timeout=30))
    except urllib.error.HTTPError as e:
        return {"error": "HTTP %s" % e.code}


def get(path, token):
    req = urllib.request.Request(API + path + ("&" if "?" in path else "?") + "organization_id=" + ORG,
                                 headers={"Authorization": "Zoho-oauthtoken " + token})
    try:
        return urllib.request.urlopen(req, timeout=30).status, None
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode("utf-8", "replace")


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
    env = dict(l.split("=", 1) for l in open(ENV).read().splitlines() if "=" in l and not l.startswith("#"))
    cid, csec = env.get("ZOHO_CLIENT_ID", "").strip(), env.get("ZOHO_CLIENT_SECRET", "").strip()
    if not cid or not csec:
        sys.exit("No client id/secret in %s. Nothing stored." % ENV)
    print("Using the Zoho client already in projects.env (ID ending %s)." % cid[-6:])
    state = secrets.token_urlsafe(24)
    url = ACCOUNTS + "/oauth/v2/auth?" + urllib.parse.urlencode({"scope": ",".join(SCOPES), "client_id": cid, "response_type": "code",
        "access_type": "offline", "prompt": "consent", "redirect_uri": REDIRECT, "state": state})
    print("Opening Zoho's consent page. It should ask only to READ Zoho Books banking, accountants and settings.")
    print("If it asks for an organization, choose 702999686. Then click Accept.")
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
    for path, what in (("/bankaccounts", "bank accounts"), ("/chartofaccounts", "chart of accounts")):
        code, body = get(path, access)
        if code != 200:
            sys.exit("Read test failed on %s: HTTP %s %s. Nothing stored." % (what, code, body or ""))
        print("Read test passed:", what, "(HTTP 200, org %s)" % ORG)
    value = json.dumps({"client_id": cid, "client_secret": csec, "refresh_token": refresh, "organization_id": ORG,
                        "accounts_url": ACCOUNTS, "api_base": API, "scopes": SCOPES,
                        "created": datetime.datetime.now().isoformat(timespec="seconds")})
    res = subprocess.run(["/usr/bin/security", "add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", value],
                         capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit("Could not store in Keychain (%s). Nothing stored." % res.stderr.strip()[:120])
    print('Done. Stored in Keychain as service "%s", account "%s". Read-only scopes: %s' % (SERVICE, ACCOUNT, ", ".join(SCOPES)))


if __name__ == "__main__":
    main()
