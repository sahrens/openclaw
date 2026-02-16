/**
 * LLM regression eval tests — full gateway pipeline.
 *
 * Sends eval messages through the gateway's own message pipeline so the agent
 * processes them with its full system prompt, tool definitions, and
 * personality — exactly as real user messages are handled.
 *
 * Each `.jsonl` file in this directory defines one or more eval cases.
 * The test constructs a MsgContext, injects the eval date into the timestamp
 * envelope, dispatches through `dispatchInboundMessage`, collects the reply,
 * and checks it against regex patterns.
 *
 * Requires a live API key – gated behind OPENCLAW_LIVE_TEST / LIVE env var.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchInboundMessage } from "../../src/auto-reply/dispatch.js";
import { createReplyDispatcher } from "../../src/auto-reply/reply/reply-dispatcher.js";
import { loadConfig } from "../../src/config/config.js";
import { injectTimestamp } from "../../src/gateway/server-methods/agent-timestamp.js";
import { isTruthyEnvValue } from "../../src/infra/env.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../src/utils/message-channel.js";

// ---------------------------------------------------------------------------
// Gate: only run when live tests are enabled and a provider key is present
// ---------------------------------------------------------------------------

const LIVE = isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST) || isTruthyEnvValue(process.env.LIVE);

// We need at least one LLM provider key. The gateway config determines which.
const HAS_KEY = Boolean(
  process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY,
);

const describeLive = LIVE && HAS_KEY ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvalCheck {
  must_match?: string;
  must_not_match?: string;
  explanation: string;
}

interface EvalCase {
  id: string;
  /** ISO date string (YYYY-MM-DD) the eval scenario is anchored to. */
  date: string;
  type: string;
  description: string;
  /** The user message to send through the pipeline. */
  userMessage: string;
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
 * Send a message through the gateway's agent pipeline and collect the reply.
 *
 * This mirrors what `chat.send` does internally: build a MsgContext, inject a
 * timestamp, create a reply dispatcher, and call `dispatchInboundMessage`.
 * The agent processes it with its full system prompt and tools.
 */
async function sendThroughPipeline(evalCase: EvalCase): Promise<string> {
  const cfg = loadConfig();

  // Build the timestamp-injected message using the eval's anchored date.
  // This gives the agent the correct "today" context.
  const evalDate = new Date(`${evalCase.date}T12:00:00Z`);
  const userMessage = evalCase.userMessage;
  const stampedMessage = injectTimestamp(userMessage, {
    timezone: cfg.agents?.defaults?.userTimezone ?? "UTC",
    now: evalDate,
  });

  const runId = `eval-${evalCase.id}-${Date.now()}`;

  const ctx = {
    Body: userMessage,
    BodyForAgent: stampedMessage,
    BodyForCommands: userMessage,
    RawBody: userMessage,
    CommandBody: userMessage,
    SessionKey: `eval:${evalCase.id}`,
    Provider: INTERNAL_MESSAGE_CHANNEL,
    Surface: INTERNAL_MESSAGE_CHANNEL,
    OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
    ChatType: "direct" as const,
    CommandAuthorized: true,
    MessageSid: runId,
    SenderId: "eval-harness",
    SenderName: "Eval Harness",
    SenderUsername: "eval-harness",
  };

  const replyParts: string[] = [];

  const dispatcher = createReplyDispatcher({
    deliver: async (payload, _info) => {
      const text = payload.text?.trim() ?? "";
      if (text) {
        replyParts.push(text);
      }
    },
    onError: (err) => {
      console.error(`[eval ${evalCase.id}] dispatch error:`, err);
    },
  });

  await dispatchInboundMessage({
    ctx,
    cfg,
    dispatcher,
    replyOptions: {
      runId,
      abortSignal: AbortSignal.timeout(120_000),
    },
  });

  return replyParts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describeLive("LLM regression evals (gateway pipeline)", () => {
  it("loads eval cases", async () => {
    const cases = await loadEvalCases();
    expect(cases.length).toBeGreaterThan(0);
  });

  it("runs all eval cases through the full agent pipeline", async () => {
    const cases = await loadEvalCases();
    const results: Array<{
      id: string;
      pass: boolean;
      response: string;
      failures: string[];
    }> = [];

    for (const evalCase of cases) {
      console.log(`\n🔄 Running eval [${evalCase.id}]: ${evalCase.description}`);

      const response = await sendThroughPipeline(evalCase);
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

      console.log(failures.length === 0 ? `  ✅ PASS` : `  ❌ FAIL`);
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
  }, 180_000);
});
