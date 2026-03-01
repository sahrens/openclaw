# ARC-Bench: Interactive Gridworld Benchmark + Agent Eval

A toy ARC-AGI-3–style benchmark with deterministic gridworld environments, evaluation harness for both code-based agents and LLM sub-agents, and a self-improvement loop.

## Structure

```
env/          - 6 environment types + level generator
harness/      - Evaluation runners and reporting
  runner.mjs       - Code-agent episode runner (pure JS, no LLM)
  eval-agent.mjs   - LLM sub-agent eval harness (Anthropic API)
  compare.mjs      - Compare two eval reports (baseline vs candidate)
  format-results.mjs - Format report as markdown table for PR comments
agent/        - Baseline code policy (pure JS)
improve/      - Self-improvement loop
reports/      - JSON metrics output
eval.sh       - Run LLM agent eval
run.sh        - Run code-agent eval
improve.sh    - One improvement iteration
```

## Environments

| Env            | Task                                | Actions           | Reasoning          |
| -------------- | ----------------------------------- | ----------------- | ------------------ |
| `pattern_fill` | Complete horizontal stripe pattern  | move + paint      | Pattern completion |
| `path_find`    | Navigate to target avoiding walls   | move              | Path finding       |
| `color_sort`   | Sort colors in a 1D row             | move + pick/place | Sorting            |
| `mirror`       | Complete vertical symmetry          | move + paint      | Symmetry           |
| `flood_fill`   | Toggle region cells to target color | move + toggle     | Region detection   |
| `color_map`    | Apply color substitution cipher     | move + paint      | Color mapping      |

30 train levels (5 per env, seeds 1-5) + 18 eval levels (3 per env, seeds 100-102).

## Agent Eval (LLM Sub-Agent)

The eval harness sends gridworld observations to an LLM (Claude Sonnet) and parses actions from its responses. This tests the agent's ability to solve interactive puzzles through conversation.

### How It Works

1. For each episode, the harness creates a fresh environment
2. Sends formatted observations to the Anthropic API (Claude Sonnet)
3. Parses the JSON action from the response: `{"action": "up"}`
4. Steps the environment and repeats until done or limits hit
5. Records success, steps, tokens, and wall time

### Safety/Cost Limits

| Limit                  | Value                                |
| ---------------------- | ------------------------------------ |
| Max turns per episode  | 20                                   |
| Max time per episode   | 30s                                  |
| Max episodes per run   | 50                                   |
| Max total time per run | 10 min                               |
| Model                  | claude-sonnet-4-20250514 (hardcoded) |

### Quick Start

```bash
# Run default agent eval (6 episodes, 1 per env type)
bash eval.sh

# Run all seeds (18 episodes, 3 per env type)
bash eval.sh --all

# Run eval for a specific environment
bash eval.sh path_find

# Save report to file
bash eval.sh --out reports/agent-eval.json

# Format report as markdown
node arc-bench/harness/format-results.mjs reports/agent-eval.json

# Compare baseline vs candidate
node arc-bench/harness/compare.mjs reports/baseline.json reports/candidate.json
```

### Output Format

JSON report with per-episode and per-environment results:

```json
{
  "timestamp": "...",
  "model": "sonnet",
  "limits": { "maxTurns": 20, "maxEpisodeMs": 30000, "maxEpisodes": 50, "maxTotalMs": 600000 },
  "summary": { "score": 0.xxx, "successRate": 0.xxx, "totalTokens": N, "totalTimeMs": N },
  "perEnv": { "path_find": { "solved": 3, "total": 3, "score": 1.0 } },
  "episodes": [{ "envId": "...", "seed": N, "success": true, "steps": N, "tokens": N, "timeMs": N }]
}
```

## Code-Agent Eval (No LLM)

```bash
bash run.sh        # Full eval pass
bash improve.sh    # One improvement iteration
```

## Scoring

```
score = success_rate (for agent eval)
      = success_rate × (0.5 + 0.5 × efficiency) (for code eval)
efficiency = mean((max_steps - steps_used) / max_steps) over successes
```

## Baseline Results (Code Agent v0)

| Split | Solved | Score |
| ----- | ------ | ----- |
| Train | 5/30   | 0.140 |
| Eval  | 1/18   | 0.048 |

Per-env (train): path_find 5/5 (0.840), all others 0/5.

## Design Principles

- **Deterministic environments** — same seed = same episode
- **Agent-agnostic harness** — test code agents or LLM agents
- **Cost-controlled** — hard limits on tokens, time, and episodes
- **Train/eval firewall** — eval returns only aggregate metrics
- **Small grid sizes** — 5×5 or 6×1, 15 step limit per env
