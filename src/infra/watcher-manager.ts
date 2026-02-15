/**
 * External Watcher Manager
 *
 * Manages lightweight background processes ("watchers") that poll external
 * sources and trigger agent runs via `openclaw system event` when something
 * needs attention. Watchers run without LLM involvement, saving costs
 * compared to heartbeat-based polling.
 *
 * Each watcher is a long-lived child process. If it exits, it is restarted
 * after a configurable delay (with basic backoff).
 */

import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import type { WatcherConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("watchers");

const DEFAULT_RESTART_DELAY_SECONDS = 5;
const MAX_RESTART_DELAY_SECONDS = 300; // 5 minutes cap
const RAPID_EXIT_THRESHOLD_MS = 10_000; // exits within 10s count as rapid

export type WatcherState = {
  name: string;
  config: WatcherConfig;
  process: ChildProcess | null;
  restartTimer: ReturnType<typeof setTimeout> | null;
  consecutiveRapidExits: number;
  lastStartedAt: number | null;
  stopped: boolean;
};

export type WatcherManagerHandle = {
  stop: () => Promise<void>;
  /** Restart all watchers with a new config (hot reload). */
  updateConfig: (cfg: OpenClawConfig) => void;
  /** Get names of currently running watchers. */
  getRunningWatchers: () => string[];
};

function resolveWatcherConfigs(
  cfg: OpenClawConfig,
): Array<{ name: string; config: WatcherConfig }> {
  const watchers = cfg.agents?.defaults?.watchers;
  if (!watchers || typeof watchers !== "object") {
    return [];
  }
  return Object.entries(watchers)
    .filter(([, config]) => config && config.enabled !== false && config.command?.trim())
    .map(([name, config]) => ({ name, config }));
}

function resolveRestartDelay(config: WatcherConfig, consecutiveRapidExits: number): number {
  const baseDelay = config.restartDelaySeconds ?? DEFAULT_RESTART_DELAY_SECONDS;
  // Exponential backoff for rapid exits: base * 2^(n-1), capped at MAX
  const backoffMultiplier = consecutiveRapidExits > 0 ? 2 ** (consecutiveRapidExits - 1) : 1;
  return Math.min(baseDelay * backoffMultiplier, MAX_RESTART_DELAY_SECONDS);
}

function buildWatcherEnv(name: string, config: WatcherConfig): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  // Inject watcher-specific env vars
  env.WATCHER_NAME = name;
  if (typeof config.interval === "number" && config.interval > 0) {
    env.WATCHER_INTERVAL_SECONDS = String(config.interval);
  }
  // Merge user-specified env
  if (config.env) {
    for (const [key, value] of Object.entries(config.env)) {
      env[key] = value;
    }
  }
  return env;
}

function spawnWatcher(state: WatcherState, workspaceDir: string): ChildProcess {
  const { name, config } = state;
  const command = config.command.trim();
  const cwd = config.cwd ? path.resolve(workspaceDir, config.cwd) : workspaceDir;
  const env = buildWatcherEnv(name, config);

  log.info(`starting watcher "${name}": ${command}`);
  state.lastStartedAt = Date.now();

  const child = spawn("sh", ["-c", command], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  child.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      log.info(`[${name}] ${line}`);
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (line) {
      log.warn(`[${name}] ${line}`);
    }
  });

  child.on("error", (err) => {
    log.error(`watcher "${name}" process error: ${String(err)}`);
  });

  child.on("exit", (code, signal) => {
    if (state.stopped) {
      return;
    }

    const elapsed = state.lastStartedAt ? Date.now() - state.lastStartedAt : 0;
    const isRapidExit = elapsed < RAPID_EXIT_THRESHOLD_MS;

    if (isRapidExit) {
      state.consecutiveRapidExits++;
    } else {
      state.consecutiveRapidExits = 0;
    }

    state.process = null;
    const delaySeconds = resolveRestartDelay(config, state.consecutiveRapidExits);
    log.warn(
      `watcher "${name}" exited (code=${code}, signal=${signal}); restarting in ${delaySeconds}s`,
    );

    state.restartTimer = setTimeout(() => {
      if (state.stopped) {
        return;
      }
      state.restartTimer = null;
      state.process = spawnWatcher(state, workspaceDir);
    }, delaySeconds * 1000);
  });

  return child;
}

async function stopWatcher(state: WatcherState): Promise<void> {
  state.stopped = true;

  if (state.restartTimer) {
    clearTimeout(state.restartTimer);
    state.restartTimer = null;
  }

  if (!state.process) {
    return;
  }

  const child = state.process;
  state.process = null;

  log.info(`stopping watcher "${state.name}"`);
  child.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.on("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

/**
 * Start all configured watchers. Returns a handle to stop/update them.
 */
export function startWatcherManager(params: {
  cfg: OpenClawConfig;
  workspaceDir: string;
}): WatcherManagerHandle {
  const watchers = new Map<string, WatcherState>();
  let currentWorkspaceDir = params.workspaceDir;

  const startAll = (cfg: OpenClawConfig) => {
    const configs = resolveWatcherConfigs(cfg);
    if (configs.length === 0) {
      return;
    }
    log.info(`starting ${configs.length} watcher(s)`);
    for (const { name, config } of configs) {
      const state: WatcherState = {
        name,
        config,
        process: null,
        restartTimer: null,
        consecutiveRapidExits: 0,
        lastStartedAt: null,
        stopped: false,
      };
      state.process = spawnWatcher(state, currentWorkspaceDir);
      watchers.set(name, state);
    }
  };

  const stopAll = async () => {
    const promises: Promise<void>[] = [];
    for (const state of watchers.values()) {
      promises.push(stopWatcher(state));
    }
    await Promise.all(promises);
    watchers.clear();
  };

  // Initial start
  startAll(params.cfg);

  return {
    stop: stopAll,
    updateConfig: (cfg: OpenClawConfig) => {
      // Stop all existing watchers and restart with new config
      void stopAll().then(() => {
        startAll(cfg);
      });
    },
    getRunningWatchers: () => {
      return Array.from(watchers.entries())
        .filter(([, state]) => state.process !== null && !state.stopped)
        .map(([name]) => name);
    },
  };
}
