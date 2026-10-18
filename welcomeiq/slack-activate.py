#!/usr/bin/env python3
"""Build the OpenClaw patch that connects Slack channel C0CAZSHTJ48 to coval-welcomeiq.

Default is a dry run through `openclaw config patch --dry-run`. Pass --apply only after Damian
has installed the Slack app and run slack-store-tokens.sh, which writes ~/.openclaw/credentials/welcomeiq-slack.json
(mode 600). This script never reads, prints or stores a token: config holds file SecretRefs only.
`bindings` is an array and patch replaces arrays, so existing bindings are carried over unchanged.
"""
import json, os, subprocess, sys, tempfile

OC = os.path.expanduser('~/.nvm/versions/node/v26.10.0/bin/openclaw')
CFG = os.path.expanduser('~/.openclaw/openclaw.json')
CHANNEL, DAMIAN, ARSALAN = 'C0CAZSHTJ48', 'U08FY0GQ9G8', 'U0C22CXLLKF'
BINDING = {'agentId': 'coval-welcomeiq',
           'match': {'channel': 'slack', 'accountId': 'welcomeiq', 'peer': {'kind': 'channel', 'id': CHANNEL}}}

SECRETS = os.path.expanduser('~/.openclaw/credentials/welcomeiq-slack.json')

def ref(key):
    return {'source': 'file', 'provider': 'welcomeiqslack', 'id': '/' + key}

def build():
    cfg = json.load(open(CFG))
    bindings = [b for b in cfg.get('bindings', []) if b != BINDING] + [BINDING]
    return {
        'secrets': {'providers': {'welcomeiqslack': {'source': 'file', 'path': SECRETS, 'mode': 'json'}}},
        'channels': {'slack': {'enabled': True, 'accounts': {'welcomeiq': {
            'enabled': True, 'mode': 'socket',
            'botToken': ref('botToken'), 'appToken': ref('appToken'),
            'dmPolicy': 'disabled', 'groupPolicy': 'allowlist', 'configWrites': False, 'joinIntro': False,
            'channels': {CHANNEL: {'requireMention': False, 'users': [DAMIAN, ARSALAN]}},
        }}}},
        'bindings': bindings,
    }

def main():
    apply = '--apply' in sys.argv
    with tempfile.NamedTemporaryFile('w', suffix='.json5', delete=False) as f:
        json.dump(build(), f, indent=1)
    try:
        cmd = [OC, 'config', 'patch', '--file', f.name] + ([] if apply else ['--dry-run'])
        r = subprocess.run(cmd, capture_output=True, text=True)
        print(r.stdout, r.stderr, sep='')
        return r.returncode
    finally:
        os.unlink(f.name)

if __name__ == '__main__':
    sys.exit(main())
