#!/bin/sh
# alert-telegram.sh — Send OpenClaw watchdog alerts to Telegram
#
# Usage: ./alert-telegram.sh <incident-file>
#
# Environment:
#   TELEGRAM_BOT_TOKEN  — Telegram bot token
#   TELEGRAM_CHAT_ID    — Chat/group ID to send alerts to
#
# This is an example alert script for use with:
#   system-prompt-guardian.sh --alert-cmd ./alert-telegram.sh

set -eu

INCIDENT="${1:?Usage: $0 <incident-file>}"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_ID:?Set TELEGRAM_CHAT_ID}"

SEVERITY="$(jq -r '.severity' "$INCIDENT")"
CHECK="$(jq -r '.check' "$INCIDENT")"
TIMESTAMP="$(jq -r '.timestamp' "$INCIDENT")"
DETAILS="$(jq -r '.details' "$INCIDENT")"
HOSTNAME="$(jq -r '.hostname' "$INCIDENT")"

case "$SEVERITY" in
    critical) EMOJI="🔴" ;;
    high)     EMOJI="🟠" ;;
    medium)   EMOJI="🟡" ;;
    *)        EMOJI="🔵" ;;
esac

MESSAGE="${EMOJI} OpenClaw Watchdog Alert

Severity: ${SEVERITY}
Check: ${CHECK}
Host: ${HOSTNAME}
Time: ${TIMESTAMP}

${DETAILS}"

curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d chat_id="$CHAT_ID" \
    -d text="$MESSAGE" \
    >/dev/null

echo "Alert sent to Telegram chat $CHAT_ID"
