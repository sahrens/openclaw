#!/usr/bin/env node
// Format eval report as markdown table (for PR comments)
import { readFileSync } from "fs";

function fmt(n, d = 3) {
  return typeof n === "number" ? n.toFixed(d) : "N/A";
}

function format(reportPath) {
  const r = JSON.parse(readFileSync(reportPath, "utf-8"));

  const lines = [
    `## Agent Eval Report`,
    ``,
    `**Model:** ${r.model} | **Time:** ${r.timestamp}`,
    ``,
    `### Summary`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Score | ${fmt(r.summary.score)} |`,
    `| Success Rate | ${fmt(r.summary.successRate)} (${r.episodes.filter((e) => e.success).length}/${r.episodes.length}) |`,
    `| Total Tokens | ${r.summary.totalTokens.toLocaleString()} |`,
    `| Wall Time | ${fmt(r.summary.totalTimeMs / 1000, 1)}s |`,
    ``,
    `### Per-Environment`,
    `| Environment | Solved | Score |`,
    `|-------------|--------|-------|`,
  ];

  for (const [env, data] of Object.entries(r.perEnv).toSorted(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${env} | ${data.solved}/${data.total} | ${fmt(data.score)} |`);
  }

  // Limits hit
  const limitsHit = r.episodes.filter((e) => e.limitHit);
  if (limitsHit.length) {
    lines.push("", "### Limits Hit", `${limitsHit.length} episode(s) hit limits:`);
    for (const e of limitsHit) {
      lines.push(`- ${e.envId} seed=${e.seed}: ${e.limitHit}`);
    }
  }

  console.log(lines.join("\n"));
}

const [, , reportPath] = process.argv;
if (!reportPath) {
  console.error("Usage: node format-results.mjs <report.json>");
  process.exit(1);
}
format(reportPath);
