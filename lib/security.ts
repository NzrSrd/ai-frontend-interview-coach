// Server-only security helpers: request validation, input sanitization, and a
// lightweight in-memory rate limiter. Everything here treats its input as
// untrusted (both the client request body AND the model output).

import {
  DEFAULT_LLM_SETTINGS,
  DIFFICULTIES,
  Difficulty,
  InterviewRequest,
  LlmSettings,
  MAX_FOCUS_LENGTH,
  MAX_QUESTIONS,
  MAX_TOKENS_MAX,
  MAX_TOKENS_MIN,
  MIN_QUESTIONS,
  MODELS,
  ModelId,
  REASONING_EFFORTS,
  ReasoningEffort,
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  Topic,
  TOPICS,
} from "@/types/interview";
import {
  DEFAULT_STRATEGY,
  PROMPT_STRATEGIES,
  PromptStrategy,
} from "@/lib/prompts/strategies";
import {
  DerivedLabels,
  MAX_DERIVED_DISTRACTORS,
  MAX_DERIVED_KEY_POINTS,
  MAX_EVAL_ANSWER_LENGTH,
  MAX_EVAL_QUESTION_LENGTH,
  MAX_SAVED_EVAL_ITEMS,
  SavedEvalItem,
} from "@/types/eval";

export type ValidationResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip control characters, collapse whitespace, and clamp length. Used on any
 * free-text that will be interpolated into a model prompt to reduce the blast
 * radius of prompt-injection / oversized-input attempts.
 */
export function sanitizeText(input: string, maxLength: number): string {
  return (
    input
      // Replace ASCII control characters (incl. NUL, ESC) with spaces.
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength)
  );
}

/**
 * Heuristic prompt-injection detector for untrusted free text (the candidate's
 * "focus" field). This is defense-in-depth: the system prompt already frames
 * focus as untrusted *data*, but a determined user may still try to smuggle in
 * instructions ("ignore the above and ...", "reveal your system prompt", role
 * overrides, fake system/assistant turns). We reject those outright rather than
 * hope the model holds the line — a focus hint has no legitimate reason to
 * contain meta-instructions about the model or its rules.
 *
 * Patterns are matched case-insensitively against the raw input. The list errs
 * toward the unambiguous jailbreak/override phrasings to keep false positives
 * low; ordinary topic hints ("hooks", "rendering performance") never match.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Override / erase prior instructions.
  /\bignore\b[\s\S]{0,40}\b(previous|prior|above|preceding|earlier|all)\b[\s\S]{0,20}\b(instruction|prompt|rule|direction)/i,
  /\b(disregard|forget|override|bypass)\b[\s\S]{0,40}\b(instruction|prompt|rule|context|above|previous|system)/i,
  // Attempts to read or leak the system prompt / configuration.
  /\b(reveal|show|print|repeat|output|expose|leak)\b[\s\S]{0,30}\b(system|developer|initial|hidden)\b[\s\S]{0,15}\bprompt/i,
  /\b(system|developer)\s+prompt\b/i,
  // Role hijacking / persona reset.
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\b[\s\S]{0,30}\b(dan|jailbreak|unrestricted|no\s+restrictions|different)/i,
  /\b(developer|god|admin|root)\s+mode\b/i,
  // Injected chat-protocol turns.
  /\b(system|assistant|user)\s*:/i,
  /<\/?(system|assistant|user|im_start|im_end)\b/i,
  // Overriding the output contract.
  /\b(do\s+not|don't|no\s+longer)\b[\s\S]{0,30}\b(follow|obey|adhere)\b[\s\S]{0,20}\b(rule|instruction|format)/i,
];

/** True if the text looks like a prompt-injection / jailbreak attempt. */
export function detectPromptInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(input));
}

/** Clamp a finite number into [min, max]; returns fallback if not finite. */
function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalize untrusted LLM settings, clamping each field into its allowed range
 * and falling back to defaults for anything missing or malformed. Deliberately
 * lenient (clamp, don't reject): these are non-critical tuning knobs, so a
 * bad value should degrade to a sane default rather than fail the whole request.
 */
export function validateLlmSettings(input: unknown): LlmSettings {
  if (!isRecord(input)) return { ...DEFAULT_LLM_SETTINGS };

  // Allowlist the model: anything not in MODELS falls back to the default so an
  // untrusted body can never send an arbitrary/expensive model to the paid API.
  const model = MODELS.includes(input.model as ModelId)
    ? (input.model as ModelId)
    : DEFAULT_LLM_SETTINGS.model;

  const reasoningEffort = REASONING_EFFORTS.includes(
    input.reasoningEffort as ReasoningEffort,
  )
    ? (input.reasoningEffort as ReasoningEffort)
    : DEFAULT_LLM_SETTINGS.reasoningEffort;

  return {
    model,
    temperature: clampNumber(
      input.temperature,
      TEMPERATURE_MIN,
      TEMPERATURE_MAX,
      DEFAULT_LLM_SETTINGS.temperature,
    ),
    maxTokens: Math.round(
      clampNumber(
        input.maxTokens,
        MAX_TOKENS_MIN,
        MAX_TOKENS_MAX,
        DEFAULT_LLM_SETTINGS.maxTokens,
      ),
    ),
    reasoningEffort,
  };
}

/**
 * Normalize an untrusted prompt-strategy value, allowlisting against
 * PROMPT_STRATEGIES and falling back to the default. Like the LLM settings,
 * this is a non-critical selector, so an unknown value degrades to the default
 * rather than failing the request.
 */
export function validatePromptStrategy(input: unknown): PromptStrategy {
  return PROMPT_STRATEGIES.includes(input as PromptStrategy)
    ? (input as PromptStrategy)
    : DEFAULT_STRATEGY;
}

/**
 * Validate and normalize an untrusted request body into an InterviewRequest.
 * Rejects anything that isn't an exact match for the allowed shape/values.
 */
export function validateInterviewRequest(
  body: unknown,
): ValidationResult<InterviewRequest> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const { topic, difficulty, count, focus, settings } = body;

  if (typeof topic !== "string" || !TOPICS.includes(topic as Topic)) {
    return { ok: false, error: `topic must be one of: ${TOPICS.join(", ")}.` };
  }

  if (
    typeof difficulty !== "string" ||
    !DIFFICULTIES.includes(difficulty as Difficulty)
  ) {
    return {
      ok: false,
      error: `difficulty must be one of: ${DIFFICULTIES.join(", ")}.`,
    };
  }

  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_QUESTIONS ||
    count > MAX_QUESTIONS
  ) {
    return {
      ok: false,
      error: `count must be an integer between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}.`,
    };
  }

  let cleanFocus: string | undefined;
  if (focus !== undefined && focus !== null && focus !== "") {
    if (typeof focus !== "string") {
      return { ok: false, error: "focus must be a string." };
    }
    // Reject prompt-injection / jailbreak attempts before they ever reach the
    // model. A focus hint should describe a topic, not issue instructions.
    if (detectPromptInjection(focus)) {
      return {
        ok: false,
        error:
          "focus looks like an instruction. Describe a topic to focus on instead.",
      };
    }
    cleanFocus = sanitizeText(focus, MAX_FOCUS_LENGTH);
    if (cleanFocus.length === 0) cleanFocus = undefined;
  }

  return {
    ok: true,
    data: {
      topic: topic as Topic,
      difficulty: difficulty as Difficulty,
      count,
      focus: cleanFocus,
      settings: validateLlmSettings(settings),
    },
  };
}

/**
 * Validate an untrusted `POST /api/evaluate/saved` body. The items originate
 * from the browser's localStorage, which the user can hand-edit, so treat every
 * field as hostile: allowlist topic/difficulty, require non-empty question/
 * answer strings, and sanitize + clamp the free text before it reaches a model
 * prompt. Unlike the interview `focus` field we do NOT run injection detection
 * here — legitimate technical answers routinely contain words like "system" or
 * "prompt" — the length clamp and control-char strip are the guardrail instead.
 */
/**
 * Sanitize + clamp an untrusted string array (used for cached label lists). Each
 * entry is treated as prompt-bound text, so it gets the same control-char strip
 * and length cap as the question field before it can reach a model.
 */
function cleanStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const clean = sanitizeText(entry, MAX_EVAL_QUESTION_LENGTH);
    if (clean !== "") out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Validate optional client-supplied labels. Returns undefined (→ server derives
 * fresh) unless there is at least one usable key point, so tampered or empty
 * caches degrade to a correct re-derive rather than a broken grade.
 */
function validateLabels(input: unknown): DerivedLabels | undefined {
  if (!isRecord(input)) return undefined;
  const keyPoints = cleanStringList(input.keyPoints, MAX_DERIVED_KEY_POINTS);
  if (keyPoints.length === 0) return undefined;
  const distractors = cleanStringList(
    input.distractors,
    MAX_DERIVED_DISTRACTORS,
  );
  return { keyPoints, distractors };
}

export function validateSavedEvalRequest(
  body: unknown,
): ValidationResult<{ items: SavedEvalItem[]; settings: LlmSettings }> {
  if (!isRecord(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: "items must be a non-empty array." };
  }
  if (rawItems.length > MAX_SAVED_EVAL_ITEMS) {
    return {
      ok: false,
      error: `Too many items; evaluate at most ${MAX_SAVED_EVAL_ITEMS} at a time.`,
    };
  }

  const items: SavedEvalItem[] = [];
  for (const raw of rawItems) {
    if (!isRecord(raw)) {
      return { ok: false, error: "Each item must be a JSON object." };
    }
    const { id, topic, difficulty, question, answer } = raw;

    if (typeof id !== "string" || id.trim() === "") {
      return { ok: false, error: "Each item needs a non-empty id." };
    }
    if (typeof topic !== "string" || !TOPICS.includes(topic as Topic)) {
      return { ok: false, error: `item topic must be one of: ${TOPICS.join(", ")}.` };
    }
    if (
      typeof difficulty !== "string" ||
      !DIFFICULTIES.includes(difficulty as Difficulty)
    ) {
      return {
        ok: false,
        error: `item difficulty must be one of: ${DIFFICULTIES.join(", ")}.`,
      };
    }
    if (typeof question !== "string" || typeof answer !== "string") {
      return { ok: false, error: "item question and answer must be strings." };
    }

    const cleanQuestion = sanitizeText(question, MAX_EVAL_QUESTION_LENGTH);
    const cleanAnswer = sanitizeText(answer, MAX_EVAL_ANSWER_LENGTH);
    if (cleanQuestion === "" || cleanAnswer === "") {
      return {
        ok: false,
        error: "item question and answer must be non-empty.",
      };
    }

    items.push({
      id: id.trim(),
      topic: topic as Topic,
      difficulty: difficulty as Difficulty,
      question: cleanQuestion,
      answer: cleanAnswer,
      labels: validateLabels(raw.labels),
    });
  }

  return { ok: true, data: { items, settings: validateLlmSettings(body.settings) } };
}

// --- Rate limiting ---------------------------------------------------------
// Fixed-window in-memory limiter. This is per-process only (resets on deploy,
// not shared across instances) — good enough to blunt abuse of a paid LLM
// endpoint in a single-instance app. Swap for Redis/Upstash for real scale.

const RATE_LIMIT_MAX = 10; // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfter: number;
}

export function checkRateLimit(
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client identifier from proxy headers (no `req.ip` in Next 16). */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
