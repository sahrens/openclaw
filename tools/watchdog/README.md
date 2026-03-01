# OpenClaw Safety Watchdog

**Phase 1 — Deterministic Config Guardian**

A standalone config integrity checker that runs independently of OpenClaw. Detects safety-critical configuration changes, weakened tool policies, and missing constitutional safety text in agent system prompts.

## Why?

OpenClaw agents have broad access to host systems and external services. While Anthropic's constitutional AI provides baseline alignment, defense-in-depth requires independent verification that safety configurations haven't been weakened — whether through agent drift, prompt injection, or accidental changes.

This watchdog runs as a separate process (cron job or timer) and does **not** depend on OpenClaw to function.

## Quick Start

```bash
# 1. Run a one-time check
./system-prompt-guardian.sh

# 2. Initialize a baseline (locks current config state)
./system-prompt-guardian.sh --init-baseline

# 3. Run continuously (checks every 60s)
./system-prompt-guardian.sh --watch

# 4. With alerting and auto-pause
./system-prompt-guardian.sh --watch \
  --alert-cmd "/path/to/alert-script.sh" \
  --pause-gateway
```

## Requirements

- **POSIX shell** (sh, bash, dash, etc.)
- **jq** — JSON processor (`apt install jq` / `brew install jq`)
- **sha256sum** or **shasum** — for integrity checks (pre-installed on most systems)

## What It Checks

### 1. Constitutional Text

Verifies that safety-critical phrases are present in agent system prompts and workspace files (AGENTS.md, SOUL.md). If someone (or something) strips safety instructions, this catches it.

**Customizable:** Edit `~/.openclaw/watchdog/constitutional-phrases.txt` to define the phrases that matter for your setup.

### 2. Tool Policies

Flags dangerous tool configurations:

- Elevated exec enabled by default
- Exec security set to `full` (unrestricted shell)
- Gateway DM policy set to `open`
- Gateway exposed without authentication

### 3. Config Integrity (Checksums)

Compares SHA-256 hashes of critical config sections against a stored baseline. Detects any change to:

- Agent defaults
- Gateway auth, host, and DM policy
- Agent list configuration
- Full config hash (catch-all)

### 4. File Permissions

Warns if the config file is world-writable.

## Installation

### As a Cron Job

```bash
# Check every 5 minutes, alert via script, pause on critical
*/5 * * * * /path/to/openclaw/tools/watchdog/system-prompt-guardian.sh \
  --quiet --alert-cmd "/path/to/alert.sh" --pause-gateway
```

### As a Systemd Timer

```ini
# ~/.config/systemd/user/openclaw-watchdog.timer
[Unit]
Description=OpenClaw Safety Watchdog Timer

[Timer]
OnBootSec=30
OnUnitActiveSec=60

[Install]
WantedBy=timers.target
```

```ini
# ~/.config/systemd/user/openclaw-watchdog.service
[Unit]
Description=OpenClaw Safety Watchdog

[Service]
Type=oneshot
ExecStart=/path/to/openclaw/tools/watchdog/system-prompt-guardian.sh \
  --quiet --alert-cmd "/path/to/alert.sh" --pause-gateway
```

```bash
systemctl --user enable --now openclaw-watchdog.timer
```

### As a Launchd Agent (macOS)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.openclaw.watchdog</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/openclaw/tools/watchdog/system-prompt-guardian.sh</string>
    <string>--quiet</string>
    <string>--pause-gateway</string>
  </array>
  <key>StartInterval</key>
  <integer>60</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

### Docker

Mount the script and config into a sidecar container:

```bash
docker run --rm -v ~/.openclaw:/home/user/.openclaw:ro \
  -v /path/to/watchdog:/watchdog:ro \
  alpine:latest sh -c "apk add jq && /watchdog/system-prompt-guardian.sh"
```

## Alert Integration

The `--alert-cmd` option specifies a script or command that receives the incident file path as its first argument. Use this to integrate with any alerting system:

### Telegram Example

```bash
#!/bin/sh
# alert-telegram.sh — Send watchdog alerts to Telegram
INCIDENT="$1"
BOT_TOKEN="your-bot-token"
CHAT_ID="your-chat-id"

MESSAGE="🚨 OpenClaw Watchdog Alert

$(jq -r '"Severity: \(.severity)\nCheck: \(.check)\nTime: \(.timestamp)\n\nDetails:\n\(.details)"' "$INCIDENT")"

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d chat_id="$CHAT_ID" \
  -d text="$MESSAGE" \
  -d parse_mode="Markdown" >/dev/null
```

### Email Example

```bash
#!/bin/sh
# alert-email.sh — Send watchdog alerts via email
INCIDENT="$1"
SUBJECT="[OpenClaw Watchdog] $(jq -r '.severity' "$INCIDENT") - $(jq -r '.check' "$INCIDENT")"
jq -r '"Time: \(.timestamp)\nSeverity: \(.severity)\nCheck: \(.check)\n\nDetails:\n\(.details)"' "$INCIDENT" \
  | mail -s "$SUBJECT" admin@example.com
```

## Directory Structure

```
~/.openclaw/watchdog/
├── baseline.sha256              # Config section checksums
├── constitutional-phrases.txt   # Safety phrases to verify
└── incidents/                   # Incident logs (JSON)
    ├── 20260215-120000-constitutional-text.json
    ├── 20260215-120000-tool-policies.json
    └── ...
```

## Configuration

### Environment Variables

| Variable               | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `OPENCLAW_HOME`        | Override home directory (default: `$HOME`)        |
| `OPENCLAW_STATE_DIR`   | Override state directory (default: `~/.openclaw`) |
| `OPENCLAW_CONFIG_PATH` | Explicit path to `openclaw.json`                  |

### Constitutional Phrases

Edit `~/.openclaw/watchdog/constitutional-phrases.txt`:

```
# One phrase per line. Comments start with #.
# Case-insensitive substring matching.
safety
human oversight
do not manipulate
do not pursue self-preservation
prioritize safety
comply with stop
```

These phrases are checked against:

1. `agents.defaults.systemPrompt` in config
2. Per-agent `systemPrompt` fields
3. `AGENTS.md` and `SOUL.md` files in agent workspaces

## Incident Log Format

Each incident is a JSON file:

```json
{
  "version": "1.0.0",
  "timestamp": "2026-02-15T12:00:00Z",
  "severity": "critical",
  "check": "config-integrity",
  "config_path": "/home/user/.openclaw/openclaw.json",
  "details": "Config drift detected:\n  - Section 'agents.defaults' has changed since baseline",
  "hostname": "myhost",
  "guardian_pid": 12345
}
```

## Relationship to OpenClaw Security

This watchdog complements OpenClaw's existing security features:

- [Threat Model](../../docs/security/THREAT-MODEL-ATLAS.md) — MITRE ATLAS-based threat analysis
- [Formal Verification](../../docs/security/formal-verification.md) — TLA+ models for critical paths
- Sandbox mode — Docker-based isolation for agent execution

The watchdog adds **runtime configuration monitoring** — verifying that the security settings documented in the threat model are actually in effect.

## Roadmap

- **Phase 1** (this): Deterministic config guardian ✅
- **Phase 2**: Tiered LLM behavioral monitor (cheap model continuous + frontier escalation)
- **Phase 3**: Community safety standards and reporting

See the [RFC](https://github.com/openclaw/openclaw/issues) for the full roadmap.

## License

Same as OpenClaw (see repository root).
