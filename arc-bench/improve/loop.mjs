#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { baselineAgent } from "../agent/policy.mjs";
// Self-improvement loop: eval → propose changes → re-eval → accept/reject
import { runHarness } from "../harness/runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, "..", "reports");
const LOG_FILE = path.join(REPORTS_DIR, "experiment-log.json");

async function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
  } catch {
    return { experiments: [], bestEvalScore: 0, version: 0 };
  }
}

async function saveLog(log) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

async function run() {
  console.log("=== Self-Improvement Iteration ===");
  const log = await loadLog();

  // 1. Evaluate current agent
  console.log("Evaluating current policy...");
  const report = await runHarness(baselineAgent);
  const evalScore = report.eval.score;
  const trainScore = report.train.score;

  console.log(`Train score: ${trainScore.toFixed(3)} | Eval score: ${evalScore.toFixed(3)}`);
  console.log(`Previous best eval: ${log.bestEvalScore.toFixed(3)}`);

  // 2. Record result
  const experiment = {
    version: log.version,
    timestamp: new Date().toISOString(),
    trainScore,
    evalScore,
    trainDetails: {
      successRate: report.train.successRate,
      efficiency: report.train.efficiency,
    },
    evalDetails: {
      successRate: report.eval.successRate,
      efficiency: report.eval.efficiency,
    },
    change: log.version === 0 ? "baseline" : "iteration",
  };

  // 3. Accept if improved
  if (evalScore > log.bestEvalScore) {
    console.log(`✅ Improvement! ${log.bestEvalScore.toFixed(3)} → ${evalScore.toFixed(3)}`);
    log.bestEvalScore = evalScore;
    experiment.accepted = true;
  } else {
    console.log(`❌ No improvement. Keeping previous best.`);
    experiment.accepted = false;
  }

  log.experiments.push(experiment);
  log.version++;
  await saveLog(log);

  // 4. Save report
  const reportFile = path.join(REPORTS_DIR, `report-v${log.version}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`Report saved to ${reportFile}`);

  // 5. Analysis — identify weakest envs for future improvement
  if (report.train.perEnv) {
    console.log("\nPer-env train breakdown:");
    for (const [env, data] of Object.entries(report.train.perEnv)) {
      console.log(`  ${env}: ${data.solved}/${data.total} solved, score=${data.score.toFixed(3)}`);
    }
  }

  console.log("\n💡 To improve: modify agent/policy.mjs strategies, then re-run improve.sh");
}

run().catch(console.error);
