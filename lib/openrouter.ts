// OpenRouter transport + defensive parsing of model output. Server-only:
// this reads OPENROUTER_API_KEY and must never be imported into a client
// component.

import {
  DEFAULT_LLM_SETTINGS,
  InterviewQuestion,
  InterviewRequest,
  InterviewResponse,
  LlmSettings,
  MAX_QUESTIONS,
} from "@/types/interview";
import { buildInterviewPrompt, SYSTEM_PROMPT } from "@/lib/prompts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Thrown for any OpenRouter/parse failure so the route can map it to a 502. */
export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatOptions {
  /** Model tuning; defaults to DEFAULT_LLM_SETTINGS. */
  settings?: LlmSettings;
  /** Request a JSON object response (OpenRouter response_format). */
  jsonMode?: boolean;
  signal?: AbortSignal;
}

// Transient failures we retry: rate limits, upstream 5xx, and — importantly for
// reasoning models — sporadic empty completions, which the API returns
// intermittently under concurrency even when the same prompt succeeds on retry.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
// Reasoning models emit sporadic empty completions fairly often (more so on the
// smaller ones), so give transient failures several attempts before giving up.
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 400;

// The GPT-5 family are reasoning models: they spend completion tokens on hidden
// reasoning BEFORE emitting any visible answer, and `max_tokens` caps the two
// combined. So a small user-chosen budget can be consumed entirely by reasoning,
// leaving the answer empty (finish_reason "length") or truncated into invalid
// JSON. To make the "Max tokens" control behave as an *answer-length* budget, we
// add this reasoning reserve on top of it when calling the API. Raising the
// ceiling never makes the model reason more (reasoning depth is set by the
// reasoning param, not max_tokens), so this adds no cost — it only stops
// reasoning from starving the answer.
const REASONING_HEADROOM_TOKENS = 2048;

/** Internal marker so the retry loop can tell transient from fatal failures. */
class TransientError extends Error {}

/** Resolve after `ms`, or reject early if the abort signal fires. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signalAbort());
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signalAbort());
      },
      { once: true },
    );
  });
}

function signalAbort(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

/** A single OpenRouter call attempt. Throws TransientError for retryable cases. */
async function chatAttempt(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  { settings = DEFAULT_LLM_SETTINGS, jsonMode = false, signal }: ChatOptions,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Optional attribution headers recommended by OpenRouter.
        "X-Title": "AI Frontend Interview Coach",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: settings.temperature,
        // User's budget is for the answer; reserve extra for hidden reasoning.
        max_tokens: settings.maxTokens + REASONING_HEADROOM_TOKENS,
        // OpenRouter's unified reasoning param; omit entirely when disabled.
        ...(settings.reasoningEffort !== "off"
          ? { reasoning: { effort: settings.reasoningEffort } }
          : {}),
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Network-level failures are typically transient.
    throw new TransientError("Failed to reach OpenRouter.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const message = `OpenRouter returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`;
    if (RETRYABLE_STATUS.has(res.status)) throw new TransientError(message);
    // 4xx (bad key, bad request) won't fix themselves — fail fast.
    throw new OpenRouterError(message);
  }

  const data = (await res.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
      }
    | null;

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  const finishReason = choice?.finish_reason;

  if (typeof content !== "string" || content.trim() === "") {
    // finish_reason "length" means the token budget ran out (typically hidden
    // reasoning eating it all) — deterministic, so don't waste retries; surface
    // an actionable error instead. Anything else is a sporadic empty → retry.
    if (finishReason === "length") {
      throw new OpenRouterError(
        "The model ran out of tokens before it could answer. Increase Max tokens and try again.",
      );
    }
    throw new TransientError("OpenRouter returned an empty response.");
  }
  return content;
}

/**
 * Low-level OpenRouter chat call, shared by the interview generator and the eval
 * harness. Returns the raw assistant message content; callers do their own
 * parsing. Server-only — reads OPENROUTER_API_KEY.
 *
 * Retries transient failures (rate limits, 5xx, sporadic empty completions) up
 * to MAX_ATTEMPTS with exponential backoff. Aborts and non-retryable 4xx errors
 * propagate immediately.
 */
export async function openRouterChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }

  // The user-selected model (validated against the MODELS allowlist upstream).
  // OPENROUTER_MODEL, if set, is an ops-level override that wins globally.
  const settings = options.settings ?? DEFAULT_LLM_SETTINGS;
  const model = process.env.OPENROUTER_MODEL || settings.model;

  let lastTransient = "OpenRouter request failed.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await chatAttempt(apiKey, model, messages, options);
    } catch (err) {
      if (!(err instanceof TransientError)) throw err; // abort or fatal
      lastTransient = err.message;
      if (attempt < MAX_ATTEMPTS) {
        // Exponential backoff: 400ms, 800ms, ...
        await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1), options.signal);
      }
    }
  }
  throw new OpenRouterError(lastTransient);
}

/**
 * Parse untrusted model output into validated InterviewQuestion[]. Tolerates a
 * stray ```json fence and coerces/clamps the shape rather than trusting it.
 */
export function parseQuestions(raw: string): InterviewQuestion[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new OpenRouterError("Model output was not valid JSON.");
  }

  const list =
    parsed && typeof parsed === "object" && "questions" in parsed
      ? (parsed as { questions: unknown }).questions
      : parsed;

  if (!Array.isArray(list)) {
    throw new OpenRouterError("Model output did not contain a questions array.");
  }

  const questions: InterviewQuestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const q = item as Record<string, unknown>;
    const question = typeof q.question === "string" ? q.question.trim() : "";
    const answer = typeof q.answer === "string" ? q.answer.trim() : "";
    if (!question || !answer) continue;

    const followUps = Array.isArray(q.followUps)
      ? q.followUps
          .filter((f): f is string => typeof f === "string" && f.trim() !== "")
          .map((f) => f.trim())
      : [];

    questions.push({ question, answer, followUps });
  }

  if (questions.length === 0) {
    throw new OpenRouterError("Model produced no usable questions.");
  }

  return questions.slice(0, MAX_QUESTIONS);
}

/** High-level entry point used by the API route. */
export async function generateInterview(
  req: InterviewRequest,
  signal?: AbortSignal,
): Promise<InterviewResponse> {
  const content = await openRouterChat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildInterviewPrompt(req) },
    ],
    { settings: req.settings ?? DEFAULT_LLM_SETTINGS, jsonMode: true, signal },
  );

  return {
    topic: req.topic,
    difficulty: req.difficulty,
    questions: parseQuestions(content),
  };
}