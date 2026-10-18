# Task A verification, 2026-10-17

Run by a detached script from the Mac session, because stopping the terminal remote-control ends that session.

- 2026-10-17T19:31:22Z start. Terminal remote-control PID 51155: claude remote-control
- 2026-10-17T19:31:22Z sent SIGTERM to 51155
- 2026-10-17T19:31:24Z 51155 has exited
- 2026-10-17T19:31:25Z launchctl bootstrap exit 0

### Check at 2026-10-17T19:32:55Z (90 s after bootstrap)
```
	state = running
	runs = 1
	pid = 39486
	last exit code = (never exited)
		state = active
		state = active
--- remote-control processes:
39486     1       01:30 /Users/damianknowles/.local/bin/claude remote-control
--- last 10 log lines:
    ]8;;[session-url]
Continue coding in the Claude mobile app or [session-url]
Or ask Claude to work in this folder from your projects on claude.ai
space to show QR code · w to toggle spawn mode
·✔︎· Connected · agent-bus-relay · main
    Capacity: 1/32 · New sessions will be created in the current directory
    ]8;;[session-url]
Continue coding in the Claude mobile app or [session-url]
Or ask Claude to work in this folder from your projects on claude.ai
space to show QR code · w to toggle spawn mode
--- relay /healthz:
{"ok":true,"version":7,"channel":"agentbus","configured":true}
--- bus /agents as claude-code:
HTTP 200 agents 17
--- bridge service:
	state = running
	pid = 38612
		state = active
		state = active
```

### Check at 2026-10-17T19:36:26Z (5 min after bootstrap)
```
	state = running
	runs = 1
	pid = 39486
	last exit code = (never exited)
		state = active
		state = active
--- remote-control processes:
39486     1       05:01 /Users/damianknowles/.local/bin/claude remote-control
--- last 10 log lines:
    ]8;;[session-url]
Continue coding in the Claude mobile app or [session-url]
Or ask Claude to work in this folder from your projects on claude.ai
space to show QR code · w to toggle spawn mode
·✔︎· Connected · agent-bus-relay · main
    Capacity: 1/32 · New sessions will be created in the current directory
    ]8;;[session-url]
Continue coding in the Claude mobile app or [session-url]
Or ask Claude to work in this folder from your projects on claude.ai
space to show QR code · w to toggle spawn mode
--- relay /healthz:
{"ok":true,"version":7,"channel":"agentbus","configured":true}
--- bus /agents as claude-code:
HTTP 200 agents 17
--- bridge service:
	state = running
	pid = 38612
		state = active
		state = active
```

Pass means: state = running with the same pid at both checks, no 'already served' or trust error in the log, /healthz ok, /agents HTTP 200.
