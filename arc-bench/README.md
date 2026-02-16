# ARC-Bench: Interactive Gridworld Benchmark + Self-Improvement Loop

A toy ARC-AGI-3–style benchmark with deterministic gridworld environments, a code-based agent, evaluation harness, and self-improvement loop.

## Structure

```
env/          - 6 environment types + level generator
harness/      - Episode runner, scoring, train/eval splits
agent/        - Baseline policy (pure JS, no LLM calls)
improve/      - Self-improvement loop
reports/      - JSON metrics output
run.sh        - Full evaluation pass
improve.sh    - One improvement iteration
```

## Environments

| Env            | Task                                | Actions           | Reasoning          |
| -------------- | ----------------------------------- | ----------------- | ------------------ |
| `pattern_fill` | Complete horizontal stripe pattern  | move + paint      | Pattern completion |
| `path_find`    | Navigate to target avoiding walls   | move              | Path finding (BFS) |
| `color_sort`   | Sort colors in a 1D row             | move + pick/place | Sorting            |
| `mirror`       | Complete vertical symmetry          | move + paint      | Symmetry           |
| `flood_fill`   | Toggle region cells to target color | move + toggle     | Region detection   |
| `color_map`    | Apply color substitution cipher     | move + paint      | Color mapping      |

30 train levels (5 per env, seeds 1-5) + 18 eval levels (3 per env, seeds 100-102).

## Quick Start

```bash
bash run.sh        # Full eval pass
bash improve.sh    # One improvement iteration
```

## Scoring

```
score = success_rate × (0.5 + 0.5 × efficiency)
efficiency = mean((max_steps - steps_used) / max_steps) over successes
```

## Baseline Results (v0)

| Split | Solved | Score |
| ----- | ------ | ----- |
| Train | 5/30   | 0.140 |
| Eval  | 1/18   | 0.048 |

Per-env (train): path_find 5/5 (0.840), all others 0/5.

## Self-Improvement

The improvement loop (`improve.sh`):

1. Evaluates current policy on both splits
2. Records metrics (eval = aggregate only, no task leakage)
3. Accepts if eval score improves (hill-climbing)
4. Logs experiment history to `reports/experiment-log.json`

To improve: edit `agent/policy.mjs` strategy functions, then run `improve.sh`.

## Design Principles

- **No LLM calls during execution** — agent is pure JS code
- **Deterministic** — same seed = same episode
- **Train/eval firewall** — eval returns only aggregate metrics
- **Token-efficient** — small grids (5×5–6×1), 15 step limit, 48 total levels
