/**
 * LLM regression eval tests.
 *
 * Replays conversations where the agent previously made mistakes and verifies
 * the model doesn't repeat them.  Each `.jsonl` file in this directory defines
 * one or more eval cases with frozen tool outputs and regex-based checks.
 *
 * Requires a live API key – gated behind OPENCLAW_LIVE_TEST / LIVE env var.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../src/infra/env.js";

// ---------------------------------------------------------------------------
// Gate: only run when live tests are enabled and an API key is present
// ---------------------------------------------------------------------------

const LIVE = isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST) || isTruthyEnvValue(process.env.LIVE);
const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const describeLive = LIVE && API_KEY ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalMessage {
  role: "system" | "user" | "assistant" | "tool";
  name?: string;
  content: string;
}

interface EvalCheck {
  must_match?: string;
  must_not_match?: string;
  explanation: string;
}

interface EvalCase {
  id: string;
  type: string;
  description: string;
  system?: string;
  messages: EvalMessage[];
  check: EvalCheck;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadEvalCases(): Promise<EvalCase[]> {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  const cases: EvalCase[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    for (const line of content.split("\n").filter((l) => l.trim())) {
      cases.push(JSON.parse(line));
    }
  }
  return cases;
}

/**
 * Build the Anthropic messages API request body from an eval case.
 *
 * Tool-role messages are converted to an assistant message with a tool_use
 * block followed by a user message with a tool_result block (Anthropic's
 * required format).
 */
function buildAnthropicMessages(evalCase: EvalCase) {
  const system = evalCase.system ?? "You are a helpful assistant.";
  const messages: Array<{
    role: "user" | "assistant";
    content: string | Array<Record<string, unknown>>;
  }> = [];

  let toolCallIdx = 0;
  for (const msg of evalCase.messages) {
    if (msg.role === "tool") {
      // Insert a synthetic assistant tool_use + user tool_result pair
      const toolUseId = `eval_tool_${toolCallIdx++}`;
      messages.push({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: toolUseId,
            name: msg.name ?? "web_search",
            input: {},
          },
        ],
      });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: msg.content,
          },
        ],
      });
    } else if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
    // system role handled separately
  }

  return { system, messages };
}

async function callAnthropic(evalCase: EvalCase): Promise<string> {
  const { system, messages } = buildAnthropicMessages(evalCase);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.EVAL_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  return data.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeLive("LLM regression evals", () => {
  it("loads eval cases", async () => {
    const cases = await loadEvalCases();
    expect(cases.length).toBeGreaterThan(0);
  });

  it("runs all eval cases", async () => {
    const cases = await loadEvalCases();
    const results: Array<{
      id: string;
      pass: boolean;
      response: string;
      failures: string[];
    }> = [];

    for (const evalCase of cases) {
      const response = await callAnthropic(evalCase);
      const failures: string[] = [];

      if (evalCase.check.must_match) {
        const re = new RegExp(evalCase.check.must_match, "i");
        if (!re.test(response)) {
          failures.push(
            `must_match failed: expected /${evalCase.check.must_match}/i\n` +
              `  Response: ${response.slice(0, 500)}`,
          );
        }
      }

      if (evalCase.check.must_not_match) {
        const re = new RegExp(evalCase.check.must_not_match, "i");
        if (re.test(response)) {
          failures.push(
            `must_not_match failed: should NOT match /${evalCase.check.must_not_match}/i\n` +
              `  Response: ${response.slice(0, 500)}`,
          );
        }
      }

      results.push({
        id: evalCase.id,
        pass: failures.length === 0,
        response: response.slice(0, 500),
        failures,
      });
    }

    // Report
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass);

    console.log(`\nEval results: ${passed}/${results.length} passed`);
    for (const r of failed) {
      console.log(`\n❌ FAIL [${r.id}]:`);
      for (const f of r.failures) {
        console.log(`  ${f}`);
      }
      console.log(`  Response preview: ${r.response}`);
    }

    expect(failed.length).toBe(0);
  }, 60_000);
});
