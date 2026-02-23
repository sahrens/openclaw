#!/bin/bash
# Lightweight visit booking checker — polls JSONBlob every 60s, no LLM cost.
# Writes to memory/new-booking.txt for heartbeat pickup when changes detected.
STATE=/home/node/.openclaw/workspace/memory/visit-bookings.json
NOTIFY=/home/node/.openclaw/workspace/memory/new-booking.txt
BLOB_URL="https://jsonblob.com/api/jsonBlob/019c6040-9d70-7be6-a0ce-8ba888cf50d0"
LOG=/home/node/.openclaw/workspace/logs/visit-check.log
mkdir -p /home/node/.openclaw/workspace/logs

# Init state file if missing
[ -f "$STATE" ] || echo '{"bookings":[]}' > "$STATE"

while true; do
  CURRENT=$(curl -sf "$BLOB_URL" 2>/dev/null)
  if [ -n "$CURRENT" ]; then
    OLD=$(cat "$STATE")
    if [ "$CURRENT" != "$OLD" ]; then
      echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Bookings changed!" >> "$LOG"
      echo "$CURRENT" > "$NOTIFY"
      echo "$CURRENT" > "$STATE"
    fi
  else
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Failed to fetch bookings" >> "$LOG"
  fi
  sleep 60
done
