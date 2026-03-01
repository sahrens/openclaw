#!/usr/bin/env node
// Eval harness: spawns sub-agent sessions via Anthropic API to test on gridworld tasks
import { createEnv } from "../env/environments.mjs";
import { EVAL_LEVELS } from "../env/levels.mjs";

const MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const LIMITS = {
  maxTurns: 20,
  maxEpisodeMs: 30000,
  maxEpisodes: 50,
  maxTotalMs: 600000,
};

// --- Anthropic API call ---
async function callAgent(messages, signal) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages,
    }),
    signal,
  });
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const text = data.content?.[0]?.text || "";
  const usage = data.usage || {};
  return { text, tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0) };
}

// --- Parse action from agent response ---
function parseAction(text, allowedActions) {
  // Try JSON pattern first
  const jsonMatch = text.match(/\{\s*"action"\s*:\s*"([^"]+)"\s*\}/);
  if (jsonMatch && allowedActions.includes(jsonMatch[1])) {
    return jsonMatch[1];
  }
  // Fallback: find any allowed action word
  for (const a of allowedActions) {
    if (text.toLowerCase().includes(a)) {
      return a;
    }
  }
  return null;
}

// --- Format observation for agent ---
function formatObs(obs, envId, step, maxSteps) {
  const lines = [
    "You are being evaluated on an interactive gridworld puzzle.",
    "You must figure out the goal by exploring and taking actions.",
    "",
    "OBSERVATION:",
    `Grid (${obs.grid[0].length}x${obs.grid.length}): ${JSON.stringify(obs.grid)}`,
    `Agent position: (${obs.agentPos.x},${obs.agentPos.y})`,
  ];
  if (obs.inventory !== null && obs.inventory !== undefined) {
    lines.push(`Inventory: ${obs.inventory}`);
  }
  lines.push(`Step: ${step}/${maxSteps}`);
  lines.push(`Allowed actions: ${obs.allowedActions.join(", ")}`);
  lines.push("");
  lines.push('Respond with EXACTLY one action as JSON: {"action": "up"}');
  lines.push("Think briefly about what you observe, then choose an action.");
  return lines.join("\n");
}

// --- Run one episode ---
async function runEpisode(level) {
  const start = Date.now();
  const env = createEnv(level.envId, level);
  let obs = env.reset();
  const messages = [];
  let totalTokens = 0;
  let success = false;
  let steps = 0;
  let limitHit = null;

  for (let turn = 0; turn < LIMITS.maxTurns; turn++) {
    // Check episode timeout
    if (Date.now() - start > LIMITS.maxEpisodeMs) {
      limitHit = "episodeTimeout";
      break;
    }

    const obsText = formatObs(obs, level.envId, env.step_count, level.maxSteps);
    messages.push({ role: "user", content: obsText });

    let text, tokens;
    try {
      const ac = new AbortController();
      const remaining = LIMITS.maxEpisodeMs - (Date.now() - start);
      const timer = setTimeout(() => ac.abort(), Math.max(remaining, 1000));
      const result = await callAgent(messages, ac.signal);
      clearTimeout(timer);
      text = result.text;
      tokens = result.tokens;
    } catch (e) {
      limitHit = e.name === "AbortError" ? "episodeTimeout" : "apiError";
      break;
    }

    totalTokens += tokens;
    messages.push({ role: "assistant", content: text });

    const action = parseAction(text, obs.allowedActions);
    if (!action) {
      // Failed parse, continue
      steps++;
      continue;
    }

    const result = env.step(action);
    obs = result.obs;
    steps = env.step_count;
    if (result.done) {
      success = result.success;
      break;
    }
  }

  if (!limitHit && steps >= LIMITS.maxTurns) {
    limitHit = "maxTurns";
  }

  return {
    envId: level.envId,
    seed: level.seed,
    success,
    steps,
    tokens: totalTokens,
    timeMs: Date.now() - start,
    limitHit,
  };
}

// --- Main ---
async function main() {
  if (!API_KEY) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  // Parse args
  const args = process.argv.slice(2);
  const envFilter = args.find((a) => !a.startsWith("-"));
  // Default: 1 level per env (first seed only) = 6 episodes total
  const allSeeds = args.includes("--all");
  let levels = allSeeds
    ? EVAL_LEVELS
    : EVAL_LEVELS.filter((l, i, arr) => arr.findIndex((a) => a.envId === l.envId) === i);
  if (envFilter) {
    levels = levels.filter((l) => l.envId === envFilter);
  }
  levels = levels.slice(0, LIMITS.maxEpisodes);

  console.error(`Running ${levels.length} episodes with model ${MODEL}...`);

  const runStart = Date.now();
  const episodes = [];
  const perEnv = {};

  for (const level of levels) {
    if (Date.now() - runStart > LIMITS.maxTotalMs) {
      console.error("Total time limit reached, stopping.");
      break;
    }

    console.error(`  ${level.envId} seed=${level.seed}...`);
    const ep = await runEpisode(level);
    episodes.push(ep);
    console.error(
      `    ${ep.success ? "✓" : "✗"} ${ep.steps} steps, ${ep.tokens} tokens, ${ep.timeMs}ms${ep.limitHit ? ` [${ep.limitHit}]` : ""}`,
    );

    if (!perEnv[ep.envId]) {
      perEnv[ep.envId] = { solved: 0, total: 0 };
    }
    perEnv[ep.envId].total++;
    if (ep.success) {
      perEnv[ep.envId].solved++;
    }
  }

  // Compute scores
  for (const [_k, v] of Object.entries(perEnv)) {
    v.score = v.total > 0 ? v.solved / v.total : 0;
  }

  const totalSolved = episodes.filter((e) => e.success).length;
  const report = {
    timestamp: new Date().toISOString(),
    model: "sonnet",
    limits: LIMITS,
    summary: {
      score: episodes.length > 0 ? totalSolved / episodes.length : 0,
      successRate: episodes.length > 0 ? totalSolved / episodes.length : 0,
      totalTokens: episodes.reduce((s, e) => s + e.tokens, 0),
      totalTimeMs: Date.now() - runStart,
    },
    perEnv,
    episodes,
  };

  // Output report
  const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
  const json = JSON.stringify(report, null, 2);
  if (outPath) {
    const { writeFileSync } = await import("fs");
    writeFileSync(outPath, json);
    console.error(`Report written to ${outPath}`);
  } else {
    console.log(json);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
