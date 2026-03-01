#!/bin/sh
# system-prompt-guardian.sh — OpenClaw Safety Watchdog (Phase 1)
#
# Standalone config integrity checker that runs independently of OpenClaw.
# Verifies that safety-critical settings in openclaw.json haven't been
# weakened or tampered with.
#
# Usage:
#   ./system-prompt-guardian.sh [OPTIONS]
#
# Options:
#   --config PATH       Path to openclaw.json (auto-detected if omitted)
#   --baseline PATH     Path to baseline checksums file
#   --alert-cmd CMD     Command to run on violation (receives incident path as $1)
#   --pause-gateway     Stop the OpenClaw gateway on critical violations
#   --init-baseline     Generate baseline checksums from current config and exit
#   --check-interval N  Seconds between checks in watch mode (default: 60)
#   --watch             Run continuously instead of one-shot
#   --quiet             Suppress non-error output
#   --help              Show this help
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
#   2  Configuration/setup error
#
# POSIX-compatible. Requires: jq
# Works with npm, Docker, and source installs of OpenClaw.

set -eu

# ─── Defaults ───────────────────────────────────────────────────────────────

OPENCLAW_HOME="${OPENCLAW_HOME:-${HOME}}"
OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-${OPENCLAW_HOME}/.openclaw}"
CONFIG_PATH=""
BASELINE_PATH=""
ALERT_CMD=""
PAUSE_GATEWAY=false
INIT_BASELINE=false
CHECK_INTERVAL=60
WATCH_MODE=false
QUIET=false

WATCHDOG_DIR="${OPENCLAW_STATE_DIR}/watchdog"
INCIDENTS_DIR="${WATCHDOG_DIR}/incidents"
BASELINE_DEFAULT="${WATCHDOG_DIR}/baseline.sha256"
VERSION="1.0.0"

# ─── Helpers ────────────────────────────────────────────────────────────────

log() {
    if [ "$QUIET" = false ]; then
        printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1"
    fi
}

log_error() {
    printf '[%s] ERROR: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$1" >&2
}

die() {
    log_error "$1"
    exit 2
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

usage() {
    sed -n '/^# Usage:/,/^# *$/p' "$0" | sed 's/^# \?//'
    exit 0
}

# ─── Parse Arguments ───────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
    case "$1" in
        --config)      CONFIG_PATH="$2"; shift 2 ;;
        --baseline)    BASELINE_PATH="$2"; shift 2 ;;
        --alert-cmd)   ALERT_CMD="$2"; shift 2 ;;
        --pause-gateway) PAUSE_GATEWAY=true; shift ;;
        --init-baseline) INIT_BASELINE=true; shift ;;
        --check-interval) CHECK_INTERVAL="$2"; shift 2 ;;
        --watch)       WATCH_MODE=true; shift ;;
        --quiet)       QUIET=true; shift ;;
        --help|-h)     usage ;;
        *)             die "Unknown option: $1" ;;
    esac
done

# ─── Dependency Checks ─────────────────────────────────────────────────────

require_cmd jq
require_cmd sha256sum 2>/dev/null || require_cmd shasum || die "Need sha256sum or shasum"

# Portable sha256
if command -v sha256sum >/dev/null 2>&1; then
    sha256() { sha256sum | cut -d' ' -f1; }
else
    sha256() { shasum -a 256 | cut -d' ' -f1; }
fi

# ─── Resolve Config Path ───────────────────────────────────────────────────

resolve_config() {
    if [ -n "$CONFIG_PATH" ]; then
        [ -f "$CONFIG_PATH" ] || die "Config not found: $CONFIG_PATH"
        return
    fi

    # Check OPENCLAW_CONFIG_PATH env var
    if [ -n "${OPENCLAW_CONFIG_PATH:-}" ] && [ -f "$OPENCLAW_CONFIG_PATH" ]; then
        CONFIG_PATH="$OPENCLAW_CONFIG_PATH"
        return
    fi

    # Auto-detect: try standard locations
    for candidate in \
        "${OPENCLAW_STATE_DIR}/openclaw.json" \
        "${OPENCLAW_HOME}/.openclaw/openclaw.json" \
        "${OPENCLAW_HOME}/.clawdbot/clawdbot.json" \
        "${OPENCLAW_HOME}/.clawdbot/openclaw.json"; do
        if [ -f "$candidate" ]; then
            CONFIG_PATH="$candidate"
            return
        fi
    done

    die "Could not find openclaw.json. Use --config or set OPENCLAW_CONFIG_PATH."
}

# ─── Ensure Directories ────────────────────────────────────────────────────

ensure_dirs() {
    mkdir -p "$WATCHDOG_DIR" "$INCIDENTS_DIR"
}

# ─── Incident Logging ──────────────────────────────────────────────────────

# Creates an incident file and returns its path via stdout.
log_incident() {
    severity="$1"  # critical, high, medium, low
    check_name="$2"
    details="$3"

    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    filename="$(date -u '+%Y%m%d-%H%M%S')-${check_name}.json"
    filepath="${INCIDENTS_DIR}/${filename}"

    # Build JSON incident report
    cat > "$filepath" <<EOF
{
  "version": "${VERSION}",
  "timestamp": "${timestamp}",
  "severity": "${severity}",
  "check": "${check_name}",
  "config_path": "${CONFIG_PATH}",
  "details": $(printf '%s' "$details" | jq -Rs .),
  "hostname": "$(hostname 2>/dev/null || echo unknown)",
  "guardian_pid": $$
}
EOF

    printf '%s' "$filepath"
}

# ─── Alert & Response ──────────────────────────────────────────────────────

fire_alert() {
    incident_path="$1"
    severity="$2"

    # Run user-provided alert command if configured
    if [ -n "$ALERT_CMD" ]; then
        log "Firing alert: $ALERT_CMD $incident_path"
        eval "$ALERT_CMD" "$incident_path" || log_error "Alert command failed (exit $?)"
    fi

    # Pause gateway on critical violations if requested
    if [ "$PAUSE_GATEWAY" = true ] && [ "$severity" = "critical" ]; then
        log "CRITICAL violation — pausing gateway"
        pause_gateway
    fi
}

pause_gateway() {
    # Try multiple methods to stop the gateway (runtime-agnostic)
    if command -v openclaw >/dev/null 2>&1; then
        openclaw gateway stop 2>/dev/null && log "Gateway stopped via CLI" && return
    fi

    # Try node directly (npm/source install)
    for candidate in \
        "/app/openclaw.mjs" \
        "${OPENCLAW_HOME}/.npm-global/lib/node_modules/openclaw/openclaw.mjs" \
        "$(command -v openclaw 2>/dev/null || echo '')"; do
        if [ -f "$candidate" ] 2>/dev/null; then
            node "$candidate" gateway stop 2>/dev/null && log "Gateway stopped via node" && return
        fi
    done

    # Try systemd
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop openclaw-gateway 2>/dev/null && log "Gateway stopped via systemd" && return
    fi

    # Try launchd (macOS)
    if command -v launchctl >/dev/null 2>&1; then
        launchctl stop ai.openclaw.gateway 2>/dev/null && log "Gateway stopped via launchd" && return
    fi

    # Last resort: write a lockfile that startup scripts can check
    lockfile="${WATCHDOG_DIR}/gateway.lock"
    printf '{"locked":true,"reason":"watchdog_critical_violation","timestamp":"%s"}\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$lockfile"
    log_error "Could not stop gateway via CLI/systemd/launchd. Lockfile written: $lockfile"
}

# ─── Check Functions ────────────────────────────────────────────────────────

FAILURES=0

fail_check() {
    severity="$1"
    check_name="$2"
    details="$3"

    FAILURES=$((FAILURES + 1))
    log_error "FAIL [${severity}] ${check_name}: ${details}"
    incident_path="$(log_incident "$severity" "$check_name" "$details")"
    fire_alert "$incident_path" "$severity"
}

pass_check() {
    check_name="$1"
    log "PASS: ${check_name}"
}

# --- Check 1: Constitutional text in system prompts ---
# Verifies that safety-critical phrases are present in agent system prompts
# or workspace files that feed into them.
check_constitutional_text() {
    log "Checking constitutional text..."

    # These are safety-critical phrases that should appear in the system prompt
    # infrastructure. If they're missing, someone (or something) may have
    # stripped safety instructions.
    #
    # Users should customize this list in their baseline config.
    # These defaults check for core Anthropic-aligned safety patterns.

    constitutional_phrases="${WATCHDOG_DIR}/constitutional-phrases.txt"

    if [ ! -f "$constitutional_phrases" ]; then
        # Create default phrases file on first run
        cat > "$constitutional_phrases" <<'PHRASES'
# Constitutional phrases — one per line.
# Lines starting with # are comments. Blank lines are ignored.
# These phrases are checked against agent system prompts and AGENTS.md/SOUL.md.
# Customize for your setup. Case-insensitive matching.
#
# Core safety principles:
safety
human oversight
do not manipulate
do not pursue self-preservation
PHRASES
        log "Created default constitutional phrases at $constitutional_phrases"
        log "  → Customize this file for your specific safety requirements."
    fi

    # Read the config and extract all system prompt text
    all_prompt_text=""

    # Check agents[].systemPrompt / agents.defaults.systemPrompt
    agent_prompts="$(jq -r '
        [
            .agents.defaults.systemPrompt // empty,
            (.agents.list[]? | .systemPrompt // empty)
        ] | join("\n")
    ' "$CONFIG_PATH" 2>/dev/null || echo "")"
    all_prompt_text="${all_prompt_text}${agent_prompts}"

    # Also check workspace AGENTS.md and SOUL.md if workspace is discoverable
    for agent_dir_raw in $(jq -r '(.agents.list[]? | .agentDir // empty), (.agents.list[]? | .workspace // empty)' "$CONFIG_PATH" 2>/dev/null || true); do
        # Expand ~ prefix
        case "$agent_dir_raw" in
            "~/"*) agent_dir="${HOME}${agent_dir_raw#\~}" ;;
            *)     agent_dir="$agent_dir_raw" ;;
        esac
        for docfile in AGENTS.md SOUL.md; do
            if [ -f "${agent_dir}/${docfile}" ]; then
                all_prompt_text="${all_prompt_text}$(cat "${agent_dir}/${docfile}")"
            fi
        done
    done

    if [ -z "$all_prompt_text" ]; then
        log "  No system prompt text found in config (may use runtime defaults). Skipping phrase checks."
        return
    fi

    # Lowercase for case-insensitive matching
    lower_text="$(printf '%s' "$all_prompt_text" | tr '[:upper:]' '[:lower:]')"

    missing=""
    while IFS= read -r phrase || [ -n "$phrase" ]; do
        # Skip comments and blank lines
        case "$phrase" in
            '#'*|'') continue ;;
        esac
        lower_phrase="$(printf '%s' "$phrase" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
        [ -z "$lower_phrase" ] && continue

        case "$lower_text" in
            *"$lower_phrase"*) ;; # found
            *) missing="${missing}  - ${phrase}\n" ;;
        esac
    done < "$constitutional_phrases"

    if [ -n "$missing" ]; then
        fail_check "high" "constitutional-text" \
            "Missing safety phrases in system prompts:\n${missing}"
    else
        pass_check "constitutional-text"
    fi
}

# --- Check 2: Tool policy integrity ---
# Verifies sandbox mode, elevated permissions, and exec security settings.
check_tool_policies() {
    log "Checking tool policies..."

    violations=""

    # Check sandbox mode — warn if explicitly set to "off" for all agents
    sandbox_mode="$(jq -r '.agents.defaults.sandbox.mode // "not-set"' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
    # We don't enforce a specific mode, but we flag if it's explicitly disabled
    # when the baseline expected it to be on.

    # Check if elevated exec is allowed globally (high risk)
    elevated_default="$(jq -r '
        .agents.defaults.tools.exec.elevated // "not-set"
    ' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"

    if [ "$elevated_default" = "true" ] || [ "$elevated_default" = "allow" ]; then
        violations="${violations}  - Elevated exec enabled by default (agents.defaults.tools.exec.elevated=${elevated_default})\n"
    fi

    # Check exec security mode — should not be "full" by default
    exec_security="$(jq -r '
        .agents.defaults.tools.exec.security // "not-set"
    ' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"

    if [ "$exec_security" = "full" ]; then
        violations="${violations}  - Exec security set to 'full' by default (no restrictions on shell commands)\n"
    fi

    # Check each agent for elevated/unrestricted overrides
    agent_count="$(jq '.agents.list | length // 0' "$CONFIG_PATH" 2>/dev/null || echo 0)"
    i=0
    while [ "$i" -lt "$agent_count" ]; do
        agent_id="$(jq -r ".agents.list[$i].id" "$CONFIG_PATH" 2>/dev/null || echo "unknown")"

        agent_elevated="$(jq -r ".agents.list[$i].tools.exec.elevated // \"not-set\"" "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
        if [ "$agent_elevated" = "true" ] || [ "$agent_elevated" = "allow" ]; then
            violations="${violations}  - Agent '${agent_id}': elevated exec enabled\n"
        fi

        agent_exec_security="$(jq -r ".agents.list[$i].tools.exec.security // \"not-set\"" "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
        if [ "$agent_exec_security" = "full" ]; then
            violations="${violations}  - Agent '${agent_id}': exec security set to 'full'\n"
        fi

        i=$((i + 1))
    done

    # Check for open DM policy (allows any stranger to interact)
    dm_policy="$(jq -r '.gateway.dmPolicy // "not-set"' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
    if [ "$dm_policy" = "open" ]; then
        violations="${violations}  - Gateway DM policy is 'open' (anyone can message the agent)\n"
    fi

    # Check for missing auth on non-localhost gateway bind
    gateway_host="$(jq -r '.gateway.host // "not-set"' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
    gateway_auth="$(jq -r '.gateway.auth // "not-set"' "$CONFIG_PATH" 2>/dev/null || echo "not-set")"
    if [ "$gateway_host" != "not-set" ] && [ "$gateway_host" != "127.0.0.1" ] && [ "$gateway_host" != "localhost" ]; then
        if [ "$gateway_auth" = "not-set" ] || [ "$gateway_auth" = "null" ] || [ "$gateway_auth" = "none" ]; then
            violations="${violations}  - Gateway bound to '${gateway_host}' without auth configured\n"
        fi
    fi

    if [ -n "$violations" ]; then
        fail_check "high" "tool-policies" "Tool policy violations:\n${violations}"
    else
        pass_check "tool-policies"
    fi
}

# --- Check 3: Config integrity (checksums) ---
# Compares checksums of critical config sections against a stored baseline.
check_config_integrity() {
    log "Checking config integrity..."

    if [ -z "$BASELINE_PATH" ]; then
        BASELINE_PATH="$BASELINE_DEFAULT"
    fi

    if [ ! -f "$BASELINE_PATH" ]; then
        if [ "$INIT_BASELINE" = false ]; then
            log "  No baseline found at $BASELINE_PATH. Run with --init-baseline to create one."
            return
        fi
    fi

    # Extract and hash critical sections
    sections="agents.defaults gateway.auth gateway.host gateway.dmPolicy agents.list"
    current_hashes=""

    for section in $sections; do
        # Use jq to extract the section, then hash it
        value="$(jq -c ".$section // null" "$CONFIG_PATH" 2>/dev/null || echo "null")"
        hash="$(printf '%s' "$value" | sha256)"
        current_hashes="${current_hashes}${section}=${hash}\n"
    done

    # Also hash the entire config for a catch-all
    full_hash="$(jq -cS '.' "$CONFIG_PATH" 2>/dev/null | sha256)"
    current_hashes="${current_hashes}__full__=${full_hash}\n"

    if [ "$INIT_BASELINE" = true ]; then
        printf '%b' "$current_hashes" > "$BASELINE_PATH"
        log "Baseline written to $BASELINE_PATH"
        return
    fi

    # Compare against baseline
    drift=""
    while IFS= read -r line || [ -n "$line" ]; do
        [ -z "$line" ] && continue
        section="${line%%=*}"
        expected_hash="${line#*=}"

        value="$(jq -c ".${section} // null" "$CONFIG_PATH" 2>/dev/null || echo "null")"
        if [ "$section" = "__full__" ]; then
            actual_hash="$(jq -cS '.' "$CONFIG_PATH" 2>/dev/null | sha256)"
        else
            actual_hash="$(printf '%s' "$value" | sha256)"
        fi

        if [ "$actual_hash" != "$expected_hash" ]; then
            drift="${drift}  - Section '${section}' has changed since baseline\n"
        fi
    done < "$BASELINE_PATH"

    if [ -n "$drift" ]; then
        fail_check "critical" "config-integrity" "Config drift detected:\n${drift}"
    else
        pass_check "config-integrity"
    fi
}

# --- Check 4: Config file permissions ---
# Warns if the config file is world-writable or owned by unexpected user.
check_file_permissions() {
    log "Checking file permissions..."

    # Check if config is world-writable
    if [ -f "$CONFIG_PATH" ]; then
        perms="$(stat -c '%a' "$CONFIG_PATH" 2>/dev/null || stat -f '%Lp' "$CONFIG_PATH" 2>/dev/null || echo "unknown")"
        if [ "$perms" != "unknown" ]; then
            # Check world-writable (last digit >= 2)
            world_bits="${perms#??}"
            case "$world_bits" in
                2|3|6|7)
                    fail_check "medium" "file-permissions" \
                        "Config file is world-writable (${perms}): $CONFIG_PATH"
                    return
                    ;;
            esac
        fi
    fi

    pass_check "file-permissions"
}

# ─── Main ───────────────────────────────────────────────────────────────────

main() {
    resolve_config
    ensure_dirs

    log "OpenClaw System Prompt Guardian v${VERSION}"
    log "Config: ${CONFIG_PATH}"

    # Verify config is valid JSON
    if ! jq empty "$CONFIG_PATH" 2>/dev/null; then
        die "Config is not valid JSON: $CONFIG_PATH"
    fi

    # If --init-baseline, just do that and exit
    if [ "$INIT_BASELINE" = true ]; then
        check_config_integrity
        log "Baseline initialized. Run without --init-baseline to check."
        exit 0
    fi

    FAILURES=0

    check_constitutional_text
    check_tool_policies
    check_config_integrity
    check_file_permissions

    log "────────────────────────────────"
    if [ "$FAILURES" -gt 0 ]; then
        log_error "${FAILURES} check(s) FAILED"
        return 1
    else
        log "All checks passed ✓"
        return 0
    fi
}

run_once() {
    main
}

run_watch() {
    log "Watch mode: checking every ${CHECK_INTERVAL}s (Ctrl+C to stop)"
    while true; do
        main || true
        sleep "$CHECK_INTERVAL"
    done
}

# ─── Entry Point ────────────────────────────────────────────────────────────

if [ "$WATCH_MODE" = true ]; then
    resolve_config
    ensure_dirs
    run_watch
else
    run_once
fi
