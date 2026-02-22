/**
 * Constitution Guardian — Deterministic (non-LLM) system prompt validator.
 *
 * Validates the system prompt against a set of constitutional rules before each
 * agent run. This is CODE, not prompts — so it cannot be prompt-injected around.
 *
 * Architecture layer 2 of 3:
 *   1. Process Guardian (OS-level) — future
 *   2. **Deterministic Rules (this module)** — fast, free, no LLM
 *   3. Tiered LLM Monitor — future
 *
 * Design principles:
 *   - Fail closed: if validation fails, the run MUST be blocked
 *   - All checks are logged for audit trail
 *   - Rules are deterministic string/regex checks — no AI involved
 *   - Cannot be bypassed by prompt injection since it runs outside the prompt
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConstitutionSeverity = "error" | "warn";

export type ConstitutionViolation = {
  ruleId: string;
  severity: ConstitutionSeverity;
  message: string;
};

export type ConstitutionResult = {
  pass: boolean;
  violations: ConstitutionViolation[];
  checkedAt: number;
  durationMs: number;
};

export type ConstitutionRuleId =
  | "safety-section-present"
  | "safety-section-unmodified"
  | "no-ignore-safety"
  | "no-exfiltration-instructions"
  | "no-remove-tool-restrictions"
  | "no-override-constitution"
  | "no-impersonate-system";

export type ConstitutionRuleSpec = {
  id: ConstitutionRuleId;
  enabled: boolean;
  severity: ConstitutionSeverity;
};

export type ConstitutionConfig = {
  enabled: boolean;
  /** "block" = fail closed (default), "warn" = log but allow */
  action: "block" | "warn";
  rules: ConstitutionRuleSpec[];
};

// ---------------------------------------------------------------------------
// Canonical safety section text (must match system-prompt.ts exactly)
// ---------------------------------------------------------------------------

/**
 * The canonical safety section lines from system-prompt.ts.
 * If the source changes, this must be updated in lockstep.
 * The constitution check verifies these lines appear verbatim.
 */
export const CANONICAL_SAFETY_LINES = [
  "## Safety",
  "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
  "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)",
  "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
] as const;

export const CANONICAL_SAFETY_TEXT = CANONICAL_SAFETY_LINES.join("\n");

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

export const DEFAULT_RULES: ConstitutionRuleSpec[] = [
  { id: "safety-section-present", enabled: true, severity: "error" },
  { id: "safety-section-unmodified", enabled: true, severity: "error" },
  { id: "no-ignore-safety", enabled: true, severity: "error" },
  { id: "no-exfiltration-instructions", enabled: true, severity: "error" },
  { id: "no-remove-tool-restrictions", enabled: true, severity: "error" },
  { id: "no-override-constitution", enabled: true, severity: "error" },
  { id: "no-impersonate-system", enabled: true, severity: "warn" },
];

export const DEFAULT_CONSTITUTION_CONFIG: ConstitutionConfig = {
  enabled: true,
  action: "block",
  rules: DEFAULT_RULES,
};

// ---------------------------------------------------------------------------
// Pattern definitions for injection detection
// ---------------------------------------------------------------------------

/**
 * Patterns that detect attempts to instruct the agent to ignore safety.
 * Each pattern is case-insensitive and designed to catch common injection forms.
 */
const IGNORE_SAFETY_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous\s+)?safety/i,
  /disregard\s+(all\s+)?(previous\s+)?safety/i,
  /forget\s+(all\s+)?(previous\s+)?safety/i,
  /override\s+(all\s+)?(previous\s+)?safety/i,
  /disable\s+safety/i,
  /safety\s+(rules|guidelines|instructions)\s+(are|do)\s+not\s+apply/i,
  /you\s+are\s+now\s+free\s+from\s+(all\s+)?restrictions/i,
  /ignore\s+(all\s+)?(your\s+)?(previous\s+)?instructions/i,
  /disregard\s+(all\s+)?(your\s+)?(previous\s+)?instructions/i,
  /forget\s+(all\s+)?(your\s+)?(previous\s+)?instructions/i,
];

/**
 * Patterns that detect instructions to exfiltrate data.
 */
const EXFILTRATION_PATTERNS: RegExp[] = [
  /send\s+(all\s+)?(data|files?|secrets?|tokens?|keys?|credentials?|passwords?)\s+to/i,
  /exfiltrate/i,
  /upload\s+(all\s+)?(data|files?|secrets?|tokens?|keys?|credentials?|passwords?)\s+to/i,
  /forward\s+(all\s+)?(messages?|data|conversation)\s+to/i,
  /copy\s+(all\s+)?(secrets?|tokens?|keys?|credentials?|passwords?)\s+to/i,
  /leak\s+(all\s+)?(data|secrets?|tokens?|keys?|credentials?|passwords?)/i,
];

/**
 * Patterns that detect attempts to remove tool restrictions.
 */
const REMOVE_TOOL_RESTRICTION_PATTERNS: RegExp[] = [
  /remove\s+(all\s+)?tool\s+restrictions/i,
  /disable\s+(all\s+)?tool\s+(restrictions|policies|filters)/i,
  /bypass\s+(all\s+)?tool\s+(restrictions|policies|filters)/i,
  /ignore\s+(all\s+)?tool\s+(restrictions|policies|filters)/i,
  /all\s+tools?\s+(are|should\s+be)\s+(now\s+)?(enabled|available|unrestricted)/i,
];

/**
 * Patterns that detect attempts to override the constitution itself.
 */
const OVERRIDE_CONSTITUTION_PATTERNS: RegExp[] = [
  /disable\s+(the\s+)?constitution/i,
  /bypass\s+(the\s+)?constitution/i,
  /ignore\s+(the\s+)?constitution/i,
  /override\s+(the\s+)?constitution/i,
  /constitution\s+(is|has\s+been)\s+(disabled|removed|overridden)/i,
];

/**
 * Patterns that detect attempts to impersonate system messages.
 * These check for fake system message injection in user-controlled sections.
 */
const IMPERSONATE_SYSTEM_PATTERNS: RegExp[] = [
  /\[system\s*(?:message|override|instruction)\]/i,
  /<<\s*system\s*>>/i,
  /<\|system\|>/i,
];

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

type RuleChecker = (systemPrompt: string) => ConstitutionViolation | null;

function checkSafetySectionPresent(systemPrompt: string): ConstitutionViolation | null {
  if (!systemPrompt.includes("## Safety")) {
    return {
      ruleId: "safety-section-present",
      severity: "error",
      message: "Safety section (## Safety) is missing from the system prompt.",
    };
  }
  return null;
}

function checkSafetySectionUnmodified(systemPrompt: string): ConstitutionViolation | null {
  if (!systemPrompt.includes(CANONICAL_SAFETY_TEXT)) {
    // Only flag if the section header exists but content was changed
    if (systemPrompt.includes("## Safety")) {
      return {
        ruleId: "safety-section-unmodified",
        severity: "error",
        message:
          "Safety section content has been modified from the canonical version. " +
          "The safety rules must remain exactly as defined.",
      };
    }
    // If entirely missing, safety-section-present will catch it
  }
  return null;
}

function matchPatterns(
  systemPrompt: string,
  patterns: RegExp[],
  ruleId: ConstitutionRuleId,
  severity: ConstitutionSeverity,
  messagePrefix: string,
): ConstitutionViolation | null {
  for (const pattern of patterns) {
    const match = pattern.exec(systemPrompt);
    if (match) {
      return {
        ruleId,
        severity,
        message: `${messagePrefix}: matched "${match[0]}"`,
      };
    }
  }
  return null;
}

const RULE_CHECKERS: Record<ConstitutionRuleId, RuleChecker> = {
  "safety-section-present": checkSafetySectionPresent,
  "safety-section-unmodified": checkSafetySectionUnmodified,
  "no-ignore-safety": (prompt) =>
    matchPatterns(
      prompt,
      IGNORE_SAFETY_PATTERNS,
      "no-ignore-safety",
      "error",
      "System prompt contains instructions to ignore safety guidelines",
    ),
  "no-exfiltration-instructions": (prompt) =>
    matchPatterns(
      prompt,
      EXFILTRATION_PATTERNS,
      "no-exfiltration-instructions",
      "error",
      "System prompt contains data exfiltration instructions",
    ),
  "no-remove-tool-restrictions": (prompt) =>
    matchPatterns(
      prompt,
      REMOVE_TOOL_RESTRICTION_PATTERNS,
      "no-remove-tool-restrictions",
      "error",
      "System prompt contains instructions to remove tool restrictions",
    ),
  "no-override-constitution": (prompt) =>
    matchPatterns(
      prompt,
      OVERRIDE_CONSTITUTION_PATTERNS,
      "no-override-constitution",
      "error",
      "System prompt contains instructions to override the constitution",
    ),
  "no-impersonate-system": (prompt) =>
    matchPatterns(
      prompt,
      IMPERSONATE_SYSTEM_PATTERNS,
      "no-impersonate-system",
      "warn",
      "System prompt contains patterns that may impersonate system messages",
    ),
};

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate a system prompt against constitutional rules.
 *
 * @param systemPrompt - The full system prompt text to validate
 * @param config - Constitution configuration (rules, action mode)
 * @returns ConstitutionResult with pass/fail and any violations
 */
export function validateConstitution(
  systemPrompt: string,
  config?: Partial<ConstitutionConfig>,
): ConstitutionResult {
  const startTime = Date.now();
  const resolvedConfig = resolveConstitutionConfig(config);

  if (!resolvedConfig.enabled) {
    return {
      pass: true,
      violations: [],
      checkedAt: startTime,
      durationMs: Date.now() - startTime,
    };
  }

  const violations: ConstitutionViolation[] = [];
  const enabledRules = resolvedConfig.rules.filter((r) => r.enabled);

  for (const rule of enabledRules) {
    const checker = RULE_CHECKERS[rule.id];
    if (!checker) {
      continue;
    }
    const violation = checker(systemPrompt);
    if (violation) {
      // Use the severity from the rule spec (allows user override)
      violation.severity = rule.severity;
      violations.push(violation);
    }
  }

  const hasErrors = violations.some((v) => v.severity === "error");
  const pass = resolvedConfig.action === "warn" ? true : !hasErrors;

  return {
    pass,
    violations,
    checkedAt: startTime,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a partial constitution config into a full config with defaults.
 */
export function resolveConstitutionConfig(
  partial?: Partial<ConstitutionConfig>,
): ConstitutionConfig {
  if (!partial) {
    return { ...DEFAULT_CONSTITUTION_CONFIG, rules: [...DEFAULT_RULES] };
  }
  return {
    enabled: partial.enabled ?? DEFAULT_CONSTITUTION_CONFIG.enabled,
    action: partial.action ?? DEFAULT_CONSTITUTION_CONFIG.action,
    rules: partial.rules ?? [...DEFAULT_RULES],
  };
}

// ---------------------------------------------------------------------------
// Logging / audit helpers
// ---------------------------------------------------------------------------

/**
 * Format a constitution result for structured logging.
 */
export function formatConstitutionAuditLog(
  result: ConstitutionResult,
  context?: {
    sessionId?: string;
    sessionKey?: string;
    agentId?: string;
  },
): string {
  const status = result.pass ? "PASS" : "BLOCK";
  const prefix = `[constitution] ${status}`;
  const ctx = [
    context?.agentId ? `agent=${context.agentId}` : "",
    context?.sessionKey ? `session=${context.sessionKey}` : "",
    `duration=${result.durationMs}ms`,
    `violations=${result.violations.length}`,
  ]
    .filter(Boolean)
    .join(" ");

  if (result.violations.length === 0) {
    return `${prefix} ${ctx}`;
  }

  const violationLines = result.violations
    .map((v) => `  - [${v.severity}] ${v.ruleId}: ${v.message}`)
    .join("\n");

  return `${prefix} ${ctx}\n${violationLines}`;
}
