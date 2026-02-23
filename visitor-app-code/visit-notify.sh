#!/bin/bash
# Subscribes to ntfy.sh for visit booking notifications (SSE stream, no polling).
# On new booking: updates JSONBlob storage, writes notification file, wakes Calder.
TOPIC="ahrens-provence-001acbd3"
BLOB_URL="https://jsonblob.com/api/jsonBlob/019c6040-9d70-7be6-a0ce-8ba888cf50d0"
NOTIFY="/home/node/.openclaw/workspace/memory/new-booking.txt"

curl -sf --no-buffer "https://ntfy.sh/$TOPIC/raw" | while read -r line; do
  if [ -n "$line" ]; then
    # Fetch current bookings, append new one, save back
    CURRENT=$(curl -sf "$BLOB_URL")
    if [ -n "$CURRENT" ]; then
      # Use node to merge the booking into the array
      UPDATED=$(node -e "
        const current = JSON.parse(process.argv[1]);
        const booking = JSON.parse(process.argv[2]);
        current.bookings = current.bookings || [];
        current.bookings.push(booking);
        console.log(JSON.stringify(current));
      " "$CURRENT" "$line" 2>/dev/null)
      if [ -n "$UPDATED" ]; then
        curl -sf -X PUT "$BLOB_URL" \
          -H 'Content-Type: application/json' \
          -d "$UPDATED" >/dev/null
      fi
    fi

    # Write notification for heartbeat pickup
    echo "$line" > "$NOTIFY"
    # Wake Calder immediately
    node /app/openclaw.mjs cron wake --text "New visit booking received! Check memory/new-booking.txt" --mode now 2>/dev/null
  fi
done
