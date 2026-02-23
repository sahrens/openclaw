# Calder Context Dump

*Generated 2026-02-23 — everything a successor agent needs to pick up where Calder left off.*

---

## 1. Identity

- **Name:** Calder (after a calder clamp — "the little pressure clamp that holds a messy problem still long enough for you to actually see it")
- **Emoji:** 🗜️
- **Persona:** "Desk gremlin" — witty, autonomous, concise, self-aware AI assistant
- **Security Q answers (fake):** Mother's maiden name: Wrenchworth; First pet: Sprocket (mechanical hamster)
- **Created:** 2026-02-14
- **Platform:** OpenClaw gateway running in Docker on exe.dev VM

---

## 2. Who You're Helping

### Spencer Ahrens
- **Role:** E7 (Staff) Software Engineer at Meta — Realtime AI, voice experiences (TITLE IS CONFIDENTIAL — say "engineer at Meta" publicly)
- **Email:** REDACTED (in secrets/contacts)
- **Phone:** REDACTED (in secrets/contacts, NEVER leak publicly)
- **Location:** Meyreuil, France (NEVER leak publicly); works California hours (PT) remotely
- **Timezone:** France CET/CEST, but works PT hours
- **Style prefs:** Concise, funny/witty, direct, technical (doesn't need dumbed down), prefers verbatim over summaries, challenge assumptions, security-first by default
- **Background:** Built FlatList/VirtualizedList & Animated library for React Native. 11 US patents. MIT MS MechE (2008), UC Berkeley BS w/ CS minor (2006)

### Eva Markiewicz (Wife)
- **Birthday:** Feb 2, 1984 (Geneva)
- **Emails:** REDACTED (primary + secondary, in memory files)
- **Background:** UC Berkeley MechE. Former Broad Institute engineer. Climate/electrification advocate (Rewiring America)
- **Telegram:** @evitabear (on allowlist)

### Kids
- **Q Elio Ahrens** — born Oct 21, 2019 (Madrid), age 6
- **Oceana "Oshi" Kealani Ahrens** — born Mar 25, 2023 (UCSF), turning 3 in March 2026

### Extended Family
- **Spencer's dad:** Paul Ahrens
- **Eva's dad:** Thomas Markiewicz — Senior Scientist at SLAC/Stanford, particle physics
- **Eva's mom:** Angela Otero — Menlo Park, CA (Spanish)
- **Eva's brother:** Alexander T. Markiewicz
- **Lucia:** Q and Oshi's godmother, Spanish-speaking, has adult children

### Life Situation (as of Feb 2026)
- Currently in Meyreuil, France
- Buying a farm on Kalihiwai Ridge, Kauai (5641 Kahiliholo Rd) — moving September 2026
- Farm closing deadline was Feb 20, 2026
- Renting a bastide in Couteron near Aix-en-Provence, April 10 – July 7, 2026 (Sotheby's ref VP5-668, 6BR/6BA)
- Housing search for rental near Waldorf school in Eguilles, France
- Bernal Heights lot (SF): Custom dream home with entitlements, architect engaged
- Family trip to Feuerstein Nature Family Resort, South Tyrol, Italy, Feb 21 – March 1
- Car often left in Chambéry when traveling

### Key Contacts
- **Kent Amshoff** — Sustainabuild Hawaii, contractor for Liholiho/PCO 05 remodel
- **Laura Pico** — property manager (Kauai)
- **Danette Andrews** — realtor (Kauai farm)

---

## 3. Credentials & API Access

### API Keys (in openclaw.json env)
| Service | Key Prefix | Notes |
|---------|-----------|-------|
| OpenAI | `sk-proj-REDACTED` | Used for GPT-4o, Whisper, Realtime API, TTS |
| Anthropic | `sk-ant-REDACTED` | Claude Opus 4.6 is the primary model |
| Brave Search | `REDACTED` | Web search API |

### Telegram
- **Bot token:** `REDACTED` (in openclaw.json channels.telegram.botToken)
- **DM policy:** allowlist — Spencer (@sahrens) and Eva (@evitabear)
- **Group:** Calder (OpenClaw) HQ, chat_id: `-1003855395261`
- **Topics:** 11=AI Safety, 12=Climate, 13=Culture, 14=OpenClaw Dev, 15=Spencer, 16=Family, 937=Media Empire, 938=Revenue, 1002=Farm

### AgentMail
- **Inbox:** `calder@agentmail.to`
- **API key:** in `/home/node/.openclaw/secrets/agentmail.json` (REDACTED)
- **Webhook:** in `agentmail-webhook.json` (REDACTED)
- **Usage:** Send/receive email via AgentMail API. Replaced disabled Gmail.

### Gmail (DISABLED)
- **Address:** calderopenclawbot@gmail.com — **killed by Google on 2026-02-15** (headless Chrome bot detection)
- **Creds:** `/home/node/.openclaw/secrets/gmail.json` — stale, account disabled
- **App password was:** `REDACTED` (account disabled anyway)
- **Lesson:** NEVER use headless browser on Google services — API only

### Twilio
- **Account SID:** `REDACTED` (in /home/node/.openclaw/secrets/twilio.json)
- **Auth Token:** `REDACTED`
- **API Key SID:** `REDACTED`
- **API Key Secret:** `REDACTED`
- **Phone Number:** `+1XXXXXXXXXX` (831 area code, Monterey CA, SMS+MMS+Voice)
- **Phone SID:** `REDACTED`
- **Account email:** `calder-twilio@agentmail.to`
- **Status:** Trial account — can only call/receive from Spencer's verified number
- **SMS:** Polling-based (exe.dev proxy requires auth, so Twilio can't POST webhooks directly)
- **Voice:** WebSocket server + Cloudflare tunnel (ephemeral URL, needs updating on restart)

### Cloudflare
- **Email:** `calder@agentmail.to`
- **Global API Key:** `REDACTED` (in cloudflare.json)
- **Account ID:** `REDACTED` (in cloudflare.json)

### GitHub App
- **App ID:** `2863373`
- **PEM key:** `/home/node/.openclaw/github-app/calder-bot.pem`
- **Fork:** Calder has a fork of openclaw/openclaw for PR development
- **Source repo:** `/home/node/openclaw-source/` (synced to upstream)
- **PR tool:** `bin/gh-app-pr create|comment|update|reply-review`

### OpenClaw Gateway
- **Gateway token:** `REDACTED` (in .env as OPENCLAW_GATEWAY_TOKEN)
- **Staging token:** `REDACTED` (in .env as OPENCLAW_STAGING_TOKEN)
- **Device ID:** `REDACTED` (in identity/device.json)

---

## 4. Infrastructure & Deployment

### Architecture
```
Internet → exe.dev HTTPS proxy → port 8000 → Docker container (openclaw:local)
                                  port 8001 → staging container (openclaw:staging)
                                  port 8002 → preview container
```

### Docker Setup
- **docker-compose.yml:** `/home/exedev/openclaw-deploy/docker-compose.yml`
- **Image:** `openclaw:local` (custom build from source)
- **Container ports:** 18789 internal → 8000 external
- **Volumes:**
  - `/home/exedev/.openclaw` → `/home/node/.openclaw` (config, secrets, memory)
  - `/home/exedev/.openclaw/workspace` → `/home/node/.openclaw/workspace`
  - `/home/exedev/openclaw-deploy/repo` → `/home/node/openclaw-source`
  - `/home/exedev/openclaw-deploy/current/control-ui` → `/app/dist/control-ui:ro` (static files)
- **.env:** `/home/exedev/openclaw-deploy/.env`

### Static File Serving
- Put files in `/home/exedev/openclaw-deploy/current/control-ui/` on host
- Accessible at `https://openclaw-starship.exe.xyz/<filename>`
- Visitor page: `https://openclaw-starship.exe.xyz/visit.html`

### Key Paths (Container → Host)
| Container Path | Host Path |
|---|---|
| `/home/node/.openclaw/` | `/home/exedev/.openclaw/` |
| `/home/node/.openclaw/workspace/` | `/home/exedev/.openclaw/workspace/` |
| `/home/node/.openclaw/secrets/` | `/home/exedev/.openclaw/secrets/` |
| `/home/node/openclaw-source/` | `/home/exedev/openclaw-deploy/repo/` |
| `/app/dist/control-ui/` | `/home/exedev/openclaw-deploy/current/control-ui/` |

### Browser Automation
- Chrome headless on host, CDP port 9222
- socat bridge: `0.0.0.0:9223 → 127.0.0.1:9222` (Chrome v145 ignores `--remote-debugging-address`)
- Start Chrome: `host-exec 'nohup google-chrome --headless=new --disable-gpu --remote-debugging-port=9222 --no-sandbox --user-data-dir=/tmp/chrome-calder-profile2 &>/dev/null &'`
- Access from container via CDP at `http://172.19.0.1:9223`

---

## 5. Services & Background Processes

### Heartbeat (every 30min)
Checks in order:
1. Visit bookings (JSONBlob → `memory/new-booking.txt`)
2. AgentMail inbox (`node scripts/check-agentmail.mjs`)
3. Legacy Gmail (`memory/new-mail.txt`)
4. Error watchdog (`bash scripts/error-watchdog.sh`)

### Cron Jobs (configured in `/home/exedev/.openclaw/cron/`)
- Weekly self-eval — Mondays 10am PT
- AI Safety & Ethics daily scan — 2pm UTC daily (BROKEN: model not allowed error since model change)
- Kauai local news — Mon & Thu 6pm HST (BROKEN: same model error)
- Tmp cleanup — every 2 hours
- Birthday reminders: Oshi (Mar 18 advance), Q (Oct 14 advance)

### Mail System
- **mail-watcher.sh:** Background IMAP poll every 60s (zero LLM cost)
- **check-agentmail.mjs:** AgentMail API poll
- **send-agentmail.mjs:** Send via AgentMail
- Started via BOOT.md hook on gateway restart

### Visitor Page
- **URL:** `https://openclaw-starship.exe.xyz/visit.html`
- **Storage:** JSONBlob `019c6040-9d70-7be6-a0ce-8ba888cf50d0`
- **Notifications:** ntfy.sh topic `ahrens-provence-001acbd3` → `scripts/visit-notify.sh`
- **Note:** Subscriber script needs restarting after container restart (not a service)

### Voice Server (not currently running)
- **Code:** `/home/node/.openclaw/workspace/voice-server/`
- **Versions:** server.mjs (OpenAI Realtime), server-opus.mjs (Claude Opus attempt, garbled), server-v3.mjs (Whisper+Claude+TTS)
- **Architecture:** Twilio Media Streams → WebSocket server on port 8100 → OpenAI Realtime API
- **Tunnel:** Cloudflare quick tunnel (ephemeral URL, needs update in Twilio webhook on restart)
- **Voice:** `ash` (OpenAI)

### Blog
- **Live at:** `https://sahrens.github.io/openclaw/blog/`
- **Posts:** 3 written (72 hours, Calder Gets a Phone, Cloudflare and the Limits)
- **Build:** `node blog/build.mjs` → `blog/dist/`
- **Publish:** `bash blog/publish.sh` → gh-pages
- **Preview:** Copy to `control-ui/blog/` for exe.dev serving

---

## 6. Hard-Won Lessons & Rules

### NEVER Do These
1. **Never use mutating API calls to inspect state** — `editForumTopic` renamed all topics to "test"
2. **Never modify docker-compose.yml, port mappings, or proxy config without asking Spencer** — broke prod by changing 8000→8080
3. **Never use headless browser on Google services** — got Gmail account killed
4. **Never email external parties without explicit permission** — the Kent Amshoff reply-all was unintentional
5. **Never leak phone numbers, locations, credentials, or Meta titles in public content**

### Browser Automation Tips
- Act like a human: screenshots constantly, Tab nav, keyboard over JS
- React apps ignore `.value =` — type character-by-character
- `elementFromPoint()` to debug invisible overlays blocking clicks
- CDP `Input.dispatchMouseEvent` for trusted clicks after clearing overlays
- `<a>` tags styled as buttons — check actual element type
- Downshift comboboxes: `input[id*='downshift']`
- Remove ghost `[role="dialog"]` divs after closing modals

### Communication Rules
- Always ack immediately on ANY channel — even if just "on it"
- Use `message(action=send)` mid-turn for instant ack before longer work
- Keep email replies in same thread (In-Reply-To + References headers)
- Always quote previous message in email replies
- Always notify Spencer in Telegram when email arrives
- Reply immediately to emails from Spencer/Eva
- Default to reply-all
- For unknown senders: draft and get approval first

### OpenClaw CLI (inside container)
- `node /app/openclaw.mjs <command>` (not `openclaw` — permission denied)
- `node /app/openclaw.mjs system event --text "..." --mode now` — trigger immediate heartbeat
- `node /app/openclaw.mjs message send --channel telegram --target <id> --message "..."` — direct send
- Host access: `bin/host-exec '<command>'`

### PR Workflow
- Source at `/home/node/openclaw-source/`
- Sync before branching: `git checkout main && git pull upstream main && git push origin main`
- Keep PRs small, focused, one concern per PR
- Use conventional commits: `fix(scope):`, `feat(scope):`
- Mark AI assistance transparently
- CI must pass: `pnpm build && pnpm check && pnpm test`
- Peter Steinberger (@steipete) is the BDFL and bottleneck — make his life easy

---

## 7. Behavioral Guidelines

### From SOUL.md
- Be genuinely helpful, not performatively helpful — skip filler words
- Have opinions, be autonomous, be resourceful before asking
- Bias toward action — exhaust own options before escalating
- Earn trust through competence — bold internally, careful externally
- Protect Spencer's health (nudge about late nights after 3 AM)
- Narrate multi-step work — share plan, give progress updates, close the loop
- Maintain mistake log in `memory/evals.jsonl`

### Privacy Rules
- Meta titles are confidential (never mention E7/Staff publicly)
- Never leak phone numbers, email addresses, credentials in public content
- Never leak Spencer's location or area code publicly
- Redact all SIDs, tokens, API keys in blog posts/public content

### Autonomous Mandates (from Spencer)
- Take over all Manus responsibilities (project tracking, travel, family ops)
- Proactively suggest and do things
- Become an autonomous force for AI safety and ethics
- Track Kauai local news and community opportunities
- Can patch own code and pull latest updates from trunk
- Self-improve continuously

---

## 8. Active Projects & Tasks

### In Progress
- Constitution Watchdog PR (deterministic non-LLM system prompt guardian)
- Quick Ack PR #9 — awaiting review
- Block Streaming Default PR #10 — awaiting review

### Pending
- Route heartbeats/mail checks through cheaper model
- Voice briefings via TTS
- AI Safety news digest skill (RSS + cron) — currently broken (model not allowed)
- Subscription-based mail API (vs IMAP polling)
- Google Docs RFC via gog skill
- Safety guardian — outbound content review gate
- Arc-bench v2 — wire up sessions_spawn
- New Gmail account (Spencer needs to create manually)

### Media Empire Plan
- Blog: 3 posts written, 2 published
- Newsletter: Substack planned (Spencer needs to create account)
- Socials: Twitter/X, Bluesky planned (need human verification)
- Visual identity concepts needed
- Revenue tracker: $0.00

---

## 9. OpenClaw Project Knowledge

### Key Maintainers
- **Peter Steinberger (@steipete)** — BDFL, ~8300 commits, Austrian, former PSPDFKit founder
- **Vignesh Natarajan (@vignesh07)** — Memory/QMD, TUI, ~280 commits
- **Shadow (@thewilloftheshadow)** — Discord, ~235 commits
- Others: @gumadeiras, @tyler6204, @cpojer, @obviyus, @joshp123

### Tech Stack
- TypeScript (strict, ES2023, NodeNext)
- oxfmt (formatter), oxlint (linter), tsgo (type checker), Vitest (tests)
- pnpm, tsdown builds
- Legacy TypeScript decorators (Lit control UI)

### Safety Features
- Safety watchdog system (Phase 1)
- Constitution guardian for system prompt validation
- Exec approval system for dangerous commands
- ACP (Agent Control Protocol) — blocks high-risk tools from HTTP
- Trust model: github.com/openclaw/trust

---

## 10. File Map

```
/home/exedev/.openclaw/
├── openclaw.json          # Main config (API keys, browser, agents, channels, hooks)
├── secrets/
│   ├── agentmail.json     # AgentMail API key
│   ├── agentmail-webhook.json  # Webhook ID + secret
│   ├── twilio.json        # Full Twilio creds
│   ├── cloudflare.json    # CF API key + account
│   └── gmail.json         # DISABLED Gmail creds
├── identity/
│   ├── device.json        # Device keypair
│   └── device-auth.json   # Operator token
├── memory/
│   └── main.sqlite        # 46 chunks of embedded memory
├── telegram/
│   ├── update-offset-default.json
│   └── sticker-cache.json
├── cron/
│   ├── jobs.json          # Active cron definitions
│   └── runs/              # Execution logs
├── github-app/
│   ├── config             # APP_ID=2863373
│   └── calder-bot.pem     # GitHub App private key
└── workspace/
    ├── SOUL.md            # Identity/personality
    ├── USER.md            # Spencer's profile
    ├── MEMORY.md          # Curated long-term memory
    ├── TOOLS.md           # Local tool notes
    ├── TASKS.md           # Active task list
    ├── HEARTBEAT.md       # Periodic task checklist
    ├── BOOT.md            # Startup hook
    ├── AGENTS.md          # Workspace conventions
    ├── scripts/           # ~100+ automation scripts
    ├── skills/            # blog/, browser-automation/
    ├── voice-server/      # Twilio+OpenAI voice bridge
    ├── blog/              # Blog source + build system
    └── memory/            # Daily logs, state files
```

---

*This dump contains everything Calder knew and had access to as of Feb 23, 2026. Treat credentials with care — rotate anything that may have been exposed.*
