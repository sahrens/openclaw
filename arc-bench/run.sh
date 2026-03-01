#!/bin/bash
# Run a full evaluation pass
cd "$(dirname "$0")"
node -e "
import { runHarness } from './harness/runner.mjs';
import { baselineAgent } from './agent/policy.mjs';
import fs from 'fs';
const report = await runHarness(baselineAgent);
fs.mkdirSync('reports', { recursive: true });
const file = 'reports/report-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json';
fs.writeFileSync(file, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ train: { score: report.train.score, solved: report.train.solved + '/' + report.train.total }, eval: { score: report.eval.score, solved: report.eval.solved + '/' + report.eval.total } }, null, 2));
console.log('Full report: ' + file);
" --input-type=module
