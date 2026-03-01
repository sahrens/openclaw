// Evaluation harness: runs episodes, computes scores
import { createEnv } from "../env/environments.mjs";
import { TRAIN_LEVELS, EVAL_LEVELS } from "../env/levels.mjs";

export async function runEpisode(level, agentFn) {
  const env = createEnv(level.envId, level);
  let obs = env.reset();
  let done = false,
    success = false,
    steps = 0;

  while (!done) {
    const action = agentFn(obs, level.envId);
    const result = env.step(action);
    obs = result.obs;
    done = result.done;
    success = result.success;
    steps = env.step_count;
    if (done) {
      break;
    }
  }
  return { envId: level.envId, seed: level.seed, success, steps, maxSteps: level.maxSteps };
}

function computeScore(results) {
  const successes = results.filter((r) => r.success);
  const successRate = successes.length / results.length;
  const efficiency =
    successes.length > 0
      ? successes.reduce((s, r) => s + (r.maxSteps - r.steps) / r.maxSteps, 0) / successes.length
      : 0;
  return {
    successRate,
    efficiency,
    score: successRate * (0.5 + 0.5 * efficiency),
    total: results.length,
    solved: successes.length,
  };
}

export async function runHarness(agentFn, { mode = "both" } = {}) {
  const report = { timestamp: new Date().toISOString(), train: null, eval: null };

  if (mode === "both" || mode === "train") {
    const trainResults = [];
    for (const level of TRAIN_LEVELS) {
      trainResults.push(await runEpisode(level, agentFn));
    }
    // Per-env breakdown for train
    const byEnv = {};
    for (const r of trainResults) {
      if (!byEnv[r.envId]) {
        byEnv[r.envId] = [];
      }
      byEnv[r.envId].push(r);
    }
    report.train = {
      ...computeScore(trainResults),
      perEnv: Object.fromEntries(
        Object.entries(byEnv).map(([k, v]) => [k, { ...computeScore(v), episodes: v }]),
      ),
    };
  }

  if (mode === "both" || mode === "eval") {
    const evalResults = [];
    for (const level of EVAL_LEVELS) {
      evalResults.push(await runEpisode(level, agentFn));
    }
    // Eval: aggregate only, no per-task details
    report.eval = computeScore(evalResults);
  }

  return report;
}
