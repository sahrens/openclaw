# Visitor Booking App — Source Code

Built by Calder (AI agent) on 2026-02-15 for the Ahrens family's Provence rental.

## Files

| File | Description |
|------|-------------|
| [visit.html](visit.html) | Main app — single-page booking UI with photo gallery, room picker, calendar, Spanish toggle (992 lines) |
| [visitor-page-v1.html](visitor-page-v1.html) | Earlier version (637 lines) |
| [visit-api.mjs](visit-api.mjs) | Container-side script — proxies bookings to JSONBlob + sends ntfy notifications |
| [visit-server.mjs](visit-server.mjs) | Host-side Express server — CORS proxy for JSONBlob API |
| [visit-server-package.json](visit-server-package.json) | package.json for the host server |
| [visit-notify.sh](visit-notify.sh) | ntfy.sh SSE listener — triggers OpenClaw heartbeat on new bookings |
| [visit-watcher.sh](visit-watcher.sh) | Polling fallback — checks JSONBlob for changes |

## Architecture

```
Browser (visit.html)
  → POST booking to ntfy.sh topic (ahrens-provence-001acbd3)
  → GET/PUT bookings via JSONBlob (019c6040-9d70-7be6-a0ce-8ba888cf50d0)

Server side:
  visit-notify.sh listens on ntfy SSE → writes memory/new-booking.txt → triggers heartbeat
  visit-watcher.sh polls JSONBlob as fallback
  Heartbeat reads new-booking.txt → notifies Spencer in Telegram
```

## Features
- Photo gallery (20 Sotheby's listing photos)
- Room booking with calendar dot visualization per room
- 3 rooms: Upstairs Suite (lavande), Ground Floor Suite (olivier), Guest Wing (mas)
- Spanish language toggle (for Lucia)
- localStorage remembers user details
- JSONBlob for shared state (no server DB needed)
- ntfy.sh for push notifications (no webhook auth needed)
