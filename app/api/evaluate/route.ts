import type { ApiError } from "@/types/interview";
import type { EvalRun } from "@/types/eval";
import { OpenRouterError } from "@/lib/openrouter";
import { runEvaluation } from "@/lib/eval/runner";
import {
  checkRateLimit,
  getClientKey,
  validateLlmSettings,
  validatePromptStrategy,
} from "@/lib/security";

// Never prerender / cache: this fans out many paid LLM calls.
export const dynamic = "force-dynamic";

// A full run issues two model calls per gold item, so give it more headroom
// than the single interview call.
const REQUEST_TIMEOUT_MS = 120_000;

function json<T>(body: T, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Run the eval harness over the built-in gold set. Optionally accepts
 * `{ settings }` so answers can be generated under specific model parameters;
 * the judge always runs deterministically regardless.
 */
export async function POST(request: Request): Promise<Response> {
  // Own rate-limit bucket: one run = one hit, but it's expensive, so keep a cap.
  const rate = checkRateLimit(`eval:${getClientKey(request)}`);
  if (!rate.allowed) {
    return json<ApiError>(
      { error: "Too many evaluation runs. Please slow down." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  // Body is optional; tolerate an empty/invalid body and fall back to defaults.
  let body: unknown = undefined;
  try {
    const text = await request.text();
    if (text.trim() !== "") body = JSON.parse(text);
  } catch {
    return json<ApiError>({ error: "Invalid JSON body." }, 400);
  }

  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const settings = validateLlmSettings(record.settings);
  const strategy = validatePromptStrategy(record.strategy);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result: EvalRun = await runEvaluation(
      settings,
      strategy,
      controller.signal,
    );
    return json<EvalRun>(result, 200);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return json<ApiError>(
        { error: "The evaluation run timed out. Try again." },
        504,
      );
    }
    if (err instanceof OpenRouterError) {
      return json<ApiError>({ error: "Failed to run the evaluation." }, 502);
    }
    return json<ApiError>({ error: "Unexpected server error." }, 500);
  } finally {
    clearTimeout(timeout);
  }
}
