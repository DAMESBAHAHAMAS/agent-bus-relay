#!/bin/sh
# Damian runs this in Terminal after installing the Slack app. Input is hidden; nothing is echoed or logged.
set -eu
f="$HOME/.openclaw/credentials/welcomeiq-slack.json"
umask 077
printf 'Paste Bot User OAuth Token (xoxb-...), then Enter: '; stty -echo; read -r bot; stty echo; echo
printf 'Paste App-Level Token (xapp-..., scope connections:write), then Enter: '; stty -echo; read -r app; stty echo; echo
case "$bot" in xoxb-*) ;; *) echo "That is not a bot token (xoxb-). Nothing saved."; exit 1;; esac
case "$app" in xapp-*) ;; *) echo "That is not an app token (xapp-). Nothing saved."; exit 1;; esac
[ -f "$f" ] && cp -p "$f" "$f.bak-$(date +%Y%m%d%H%M%S)"
printf '{"botToken":"%s","appToken":"%s"}\n' "$bot" "$app" > "$f"
chmod 600 "$f"
unset bot app
echo "Saved to $f (mode 600). Tell Claude Code: tokens stored."
