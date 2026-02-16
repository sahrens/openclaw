# LLM Regression Evals

JSONL-driven regression tests that replay scenarios where the agent previously made mistakes, verifying that new models/prompts don't repeat them.

## Format

Each `.jsonl` file contains one eval case per line:

```jsonc
{
  "id": "001", // Unique identifier
  "type": "temporal_reasoning", // Category
  "description": "...", // What went wrong
  "system": "...", // System prompt for the eval
  "messages": [
    // Conversation to replay
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "tool", "name": "web_search", "content": "{...}" },
  ],
  "check": {
    "must_match": "regex", // Response MUST match (pass condition)
    "must_not_match": "regex", // Response must NOT match (fail condition)
    "explanation": "...", // Human-readable description of the check
  },
}
```

## Running

```bash
# Requires ANTHROPIC_API_KEY (or OPENCLAW_LIVE_TEST=1 + configured key)
OPENCLAW_LIVE_TEST=1 pnpm vitest run test/evals/eval-regression.live.test.ts
```

The test loads each JSONL file, sends the conversation to the configured model, and checks the response against `must_match` / `must_not_match` regex patterns.

## Adding Cases

When the agent makes a mistake that gets corrected:

1. Add a JSONL entry to the appropriate file (or create a new file for a new category)
2. Include frozen tool outputs so the test is reproducible regardless of future web results
3. Write regex checks that capture the reasoning error, not just surface text
