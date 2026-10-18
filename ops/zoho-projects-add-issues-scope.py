#!/usr/bin/env python3
"""Re-authorize the agents' Zoho Projects credential (~/.zoho/projects.env) to ALSO create and read issues.

Approved by Damian 2026-10-18. Run it yourself in Terminal:   python3 -I ops/zoho-projects-add-issues-scope.py
It asks for the one-time grant code with hidden input, exchanges it, checks the new token keeps every existing scope plus
the two issue scopes, backs up the old file (mode 600), writes the new refresh token, and verifies it. It never prints a secret.
If anything does not check out, nothing is changed.
"""
import datetime, getpass, json, os, shutil, sys, urllib.error, urllib.parse, urllib.request

PATH = os.path.expanduser("~/.zoho/projects.env")
KEEP = {"ZohoProjects.tasks.ALL", "ZohoProjects.tasklists.ALL", "ZohoProjects.projects.READ"}
ADD = {"ZohoProjects.bugs.CREATE", "ZohoProjects.bugs.READ"}


def token_call(fields):
    data = urllib.parse.urlencode(fields).encode()
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request("https://accounts.zoho.com/oauth/v2/token", data=data), timeout=30))
    except urllib.error.HTTPError as e:
        return {"error": "HTTP %s" % e.code}


def main():
    lines = open(PATH).read().splitlines()
    env = dict(l.split("=", 1) for l in lines if "=" in l and not l.startswith("#"))
    print("Zoho API Console client ending", env["ZOHO_CLIENT_ID"][-6:])
    print("Scope to generate the code with (copy exactly):\n  " + ",".join(sorted(KEEP | ADD)) + "\n")
    code = getpass.getpass("Paste the grant code (hidden): ").strip()
    if not code:
        sys.exit("No code entered. Nothing changed.")
    r = token_call({"grant_type": "authorization_code", "code": code, "client_id": env["ZOHO_CLIENT_ID"], "client_secret": env["ZOHO_CLIENT_SECRET"]})
    new = r.get("refresh_token")
    granted = set((r.get("scope") or "").replace(",", " ").split())
    if not new:
        sys.exit("Zoho did not return a refresh token (%s). The code may have expired (10 minutes) or been used. Nothing changed." % (r.get("error") or "no token"))
    missing = (KEEP | ADD) - granted if granted else set()
    if missing:
        sys.exit("The new token is missing: %s. Generate the code again with the exact scope above. Nothing changed." % ", ".join(sorted(missing)))
    backup = PATH + ".bak-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy2(PATH, backup); os.chmod(backup, 0o600)
    out = [("ZOHO_REFRESH_TOKEN=" + new) if l.startswith("ZOHO_REFRESH_TOKEN=") else l for l in lines]
    tmp = PATH + ".tmp"
    with open(tmp, "w") as f:
        f.write("\n".join(out) + "\n")
    os.chmod(tmp, 0o600); os.replace(tmp, PATH)
    check = token_call({"refresh_token": new, "client_id": env["ZOHO_CLIENT_ID"], "client_secret": env["ZOHO_CLIENT_SECRET"], "grant_type": "refresh_token"})
    if not check.get("access_token"):
        shutil.copy2(backup, PATH)
        sys.exit("The new token did not refresh; the old file was restored. Nothing changed.")
    # The agents' adapter caches an access token for ~58 minutes; mark it expired so the new scopes apply on the next call.
    cache = os.path.expanduser("~/.openclaw/cache/business-functions-direct/projects-access-token.json")
    if os.path.exists(cache):
        with open(cache + ".tmp", "w") as f:
            json.dump({"expires_at": 0, "source": "expired after adding issue scopes"}, f)
        os.chmod(cache + ".tmp", 0o600); os.replace(cache + ".tmp", cache)
    print("Done. Scopes now:", check.get("scope") or " ".join(sorted(granted)))
    print("Old file kept at", backup, "(mode 600). The old refresh token still works until you revoke it in the API Console.")


if __name__ == "__main__":
    main()
