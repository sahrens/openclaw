import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { startWatcherManager } from "./watcher-manager.js";

function makeConfig(
  watchers: Record<string, { command: string; enabled?: boolean; interval?: number }>,
): OpenClawConfig {
  return {
    agents: {
      defaults: {
        watchers,
      },
    },
  } as unknown as OpenClawConfig;
}

describe("watcher-manager", () => {
  it("starts and stops a simple watcher", async () => {
    const cfg = makeConfig({
      echo: { command: "sleep 300", enabled: true },
    });
    const manager = startWatcherManager({ cfg, workspaceDir: "/tmp" });
    expect(manager.getRunningWatchers()).toEqual(["echo"]);
    await manager.stop();
    expect(manager.getRunningWatchers()).toEqual([]);
  });

  it("skips disabled watchers", async () => {
    const cfg = makeConfig({
      active: { command: "sleep 300", enabled: true },
      inactive: { command: "sleep 300", enabled: false },
    });
    const manager = startWatcherManager({ cfg, workspaceDir: "/tmp" });
    expect(manager.getRunningWatchers()).toEqual(["active"]);
    await manager.stop();
  });

  it("skips watchers with empty command", async () => {
    const cfg = makeConfig({
      empty: { command: "  " },
    });
    const manager = startWatcherManager({ cfg, workspaceDir: "/tmp" });
    expect(manager.getRunningWatchers()).toEqual([]);
    await manager.stop();
  });

  it("returns empty list when no watchers configured", async () => {
    const cfg = { agents: { defaults: {} } } as unknown as OpenClawConfig;
    const manager = startWatcherManager({ cfg, workspaceDir: "/tmp" });
    expect(manager.getRunningWatchers()).toEqual([]);
    await manager.stop();
  });

  it("updateConfig replaces watchers", async () => {
    const cfg1 = makeConfig({
      old: { command: "sleep 300" },
    });
    const cfg2 = makeConfig({
      new: { command: "sleep 300" },
    });
    const manager = startWatcherManager({ cfg: cfg1, workspaceDir: "/tmp" });
    expect(manager.getRunningWatchers()).toEqual(["old"]);
    manager.updateConfig(cfg2);
    // Wait a tick for async stop+restart
    await new Promise((r) => setTimeout(r, 100));
    expect(manager.getRunningWatchers()).toEqual(["new"]);
    await manager.stop();
  });
});
