# LLM Regression Evals

JSONL-driven regression tests that replay scenarios where the agent previously made mistakes, verifying that new models/prompts don't repeat them.

**Key design choice:** evals run through the gateway's own message pipeline (`dispatchInboundMessage`), not bare API calls. This means the agent processes eval messages with its full system prompt, tool definitions, and personality — exactly as real user messages are handled.

## Format

Each `.jsonl` file contains one eval case per line:

```jsonc
{
  "id": "001", // Unique identifier
  "date": "2026-02-16", // Anchored date — injected as the timestamp envelope
  "type": "temporal_reasoning", // Category
  "description": "...", // What went wrong originally
  "userMessage": "...", // The user message sent through the pipeline
  "check": {
    "must_match": "regex", // Response MUST match (pass condition)
    "must_not_match": "regex", // Response must NOT match (fail condition)
    "explanation": "...", // Human-readable description of the check
  },
}
```

### Design notes

- **No custom system prompt.** The agent uses its real system prompt, tools, and personality.
- **Date anchoring.** The `date` field is injected as a `[Day YYYY-MM-DD HH:MM TZ]` timestamp envelope prefix (same as the gateway does for real messages), giving the agent correct date/time awareness.
- **Embedded context.** Search results or other context should be embedded directly in the user message (as if a user pasted them), not as pre-baked tool results.

## Running

```bash
# Requires an LLM provider key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
LIVE=1 pnpm vitest run --config vitest.eval.config.ts
```

The test loads each JSONL file, sends the user message through the full gateway agent pipeline, and checks the response against `must_match` / `must_not_match` regex patterns.

## Adding Cases

When the agent makes a mistake that gets corrected:

1. Add a JSONL entry to the appropriate file (or create a new file for a new category)
2. Set the `date` to the date the scenario is anchored to
3. Embed any required context (search results, etc.) directly in `userMessage`
4. Write regex checks that capture the reasoning error, not just surface text
