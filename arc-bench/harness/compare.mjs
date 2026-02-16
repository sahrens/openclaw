#!/usr/bin/env node
// Compare two eval reports (baseline vs candidate)
import { readFileSync } from "fs";

function load(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function fmt(n, d = 3) {
  return typeof n === "number" ? n.toFixed(d) : "N/A";
}

function compare(baselinePath, candidatePath) {
  const base = load(baselinePath);
  const cand = load(candidatePath);

  const allEnvs = new Set([...Object.keys(base.perEnv), ...Object.keys(cand.perEnv)]);

  console.log("## Eval Comparison\n");
  console.log(`| Metric | Baseline | Candidate | Delta |`);
  console.log(`|--------|----------|-----------|-------|`);
  console.log(
    `| Overall Score | ${fmt(base.summary.score)} | ${fmt(cand.summary.score)} | ${fmt(cand.summary.score - base.summary.score)} |`,
  );
  console.log(
    `| Success Rate | ${fmt(base.summary.successRate)} | ${fmt(cand.summary.successRate)} | ${fmt(cand.summary.successRate - base.summary.successRate)} |`,
  );
  console.log(
    `| Total Tokens | ${base.summary.totalTokens} | ${cand.summary.totalTokens} | ${cand.summary.totalTokens - base.summary.totalTokens} |`,
  );
  console.log(
    `| Wall Time (s) | ${fmt(base.summary.totalTimeMs / 1000, 1)} | ${fmt(cand.summary.totalTimeMs / 1000, 1)} | ${fmt((cand.summary.totalTimeMs - base.summary.totalTimeMs) / 1000, 1)} |`,
  );

  console.log("\n### Per-Environment\n");
  console.log(`| Environment | Base Score | Cand Score | Delta | Status |`);
  console.log(`|-------------|-----------|-----------|-------|--------|`);

  for (const env of [...allEnvs].toSorted()) {
    const b = base.perEnv[env] || { score: 0, solved: 0, total: 0 };
    const c = cand.perEnv[env] || { score: 0, solved: 0, total: 0 };
    const delta = c.score - b.score;
    const status = delta > 0.01 ? "🟢 improved" : delta < -0.01 ? "🔴 regressed" : "⚪ same";
    console.log(
      `| ${env} | ${fmt(b.score)} (${b.solved}/${b.total}) | ${fmt(c.score)} (${c.solved}/${c.total}) | ${fmt(delta)} | ${status} |`,
    );
  }
}

const [, , baselinePath, candidatePath] = process.argv;
if (!baselinePath || !candidatePath) {
  console.error("Usage: node compare.mjs <baseline.json> <candidate.json>");
  process.exit(1);
}
compare(baselinePath, candidatePath);
