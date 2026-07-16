// OpenRouter transport + defensive parsing of model output. Server-only:
// this reads OPENROUTER_API_KEY and must never be imported into a client
// component.

import {
  AnswerRequest,
  DEFAULT_LLM_SETTINGS,
  InterviewRequest,
  LlmSettings,
} from "@/types/interview";
import {
  buildAnswerPrompt,
  buildInterviewPrompt,
  SYSTEM_PROMPT,
} from "@/lib/prompts";
import { answerSystemPrompt, DEFAULT_STRATEGY } from "@/lib/prompts/strategies";

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

/** Shared OpenRouter request body — one source of truth for tuning + headroom. */
function chatRequestBody(
  model: string,
  messages: ChatMessage[],
  settings: LlmSettings,
  opts: { jsonMode?: boolean; stream?: boolean } = {},
): string {
  return JSON.stringify({
    model,
    messages,
    temperature: settings.temperature,
    // User's budget is for the answer; reserve extra for hidden reasoning.
    max_tokens: settings.maxTokens + REASONING_HEADROOM_TOKENS,
    // OpenRouter's unified reasoning param; omit entirely when disabled.
    ...(settings.reasoningEffort !== "off"
      ? { reasoning: { effort: settings.reasoningEffort } }
      : {}),
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(opts.stream ? { stream: true } : {}),
  });
}

const OPENROUTER_HEADERS = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  // Optional attribution header recommended by OpenRouter.
  "X-Title": "AI Frontend Interview Coach",
});

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
      headers: OPENROUTER_HEADERS(apiKey),
      body: chatRequestBody(model, messages, settings, { jsonMode }),
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

  const data = (await res.json().catch(() => null)) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
  } | null;

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
 * Open a streaming OpenRouter connection, retrying transient failures that occur
 * *before* the response body begins. Returns the OK Response. Because the caller
 * turns this into an HTTP response body, any error here still happens before a
 * status code is committed, so the route can map it to a real 4xx/5xx.
 */
async function connectChatStream(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<Response> {
  let lastTransient = "OpenRouter request failed.";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal,
        headers: OPENROUTER_HEADERS(apiKey),
        body: chatRequestBody(model, messages, settings, { stream: true }),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      lastTransient = "Failed to reach OpenRouter.";
      if (attempt < MAX_ATTEMPTS) {
        await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1), signal);
        continue;
      }
      throw new OpenRouterError(lastTransient);
    }

    if (res.ok) return res;

    const detail = await res.text().catch(() => "");
    const message = `OpenRouter returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`;
    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
      lastTransient = message;
      await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1), signal);
      continue;
    }
    // 4xx (bad key, bad request) won't fix themselves — fail fast.
    throw new OpenRouterError(message);
  }
  throw new OpenRouterError(lastTransient);
}

/**
 * Parse an OpenRouter SSE stream, yielding assistant content deltas as they
 * arrive. Ignores keep-alive comment lines and stops at the `[DONE]` sentinel.
 */
async function* sseDeltas(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new OpenRouterError("OpenRouter returned no body.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      // Blank lines separate events; lines starting with ":" are keep-alives.
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let json: {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      try {
        json = JSON.parse(data);
      } catch {
        continue; // partial/garbled event — skip it
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    }
  }
}

/**
 * Stream an arbitrary chat completion as raw text. Shared by the interview and
 * follow-up-answer routes. Errors before the first byte throw (real HTTP status
 * for the caller); a mid-stream failure or abort just ends the stream, so a
 * truncated response degrades instead of erroring.
 */
export async function streamChat(
  messages: ChatMessage[],
  options: { settings?: LlmSettings; signal?: AbortSignal } = {},
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }
  const settings = options.settings ?? DEFAULT_LLM_SETTINGS;
  const model = process.env.OPENROUTER_MODEL || settings.model;

  const res = await connectChatStream(
    apiKey,
    model,
    messages,
    settings,
    options.signal,
  );
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of sseDeltas(res)) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch {
        // Mid-stream failure or timeout abort: the 200 status is already sent,
        // so we cannot signal an error — just end with whatever arrived.
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Client went away — stop pulling from the upstream connection.
      res.body?.cancel().catch(() => {});
    },
  });
}

/**
 * High-level entry point used by the interview route: stream an interview
 * generation as raw text (the delimited block format from `lib/interviewFormat`).
 */
export function streamInterview(
  req: InterviewRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  return streamChat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildInterviewPrompt(req) },
    ],
    { settings: req.settings ?? DEFAULT_LLM_SETTINGS, signal },
  );
}

/**
 * High-level entry point used by the answer route: stream a plain-prose answer
 * to a single (follow-up) question, using the caller's chosen prompting
 * technique — the same `answerSystemPrompt` the eval harness measures.
 */
export function streamAnswer(
  req: AnswerRequest,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  return streamChat(
    [
      {
        role: "system",
        content: answerSystemPrompt(req.strategy ?? DEFAULT_STRATEGY),
      },
      { role: "user", content: buildAnswerPrompt(req) },
    ],
    { settings: req.settings ?? DEFAULT_LLM_SETTINGS, signal },
  );
}
