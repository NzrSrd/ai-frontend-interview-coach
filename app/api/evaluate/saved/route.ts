import type { ApiError } from "@/types/interview";
import type { EvalRun } from "@/types/eval";
import { OpenRouterError } from "@/lib/openrouter";
import { runSavedEvaluation } from "@/lib/eval/savedRunner";
import {
  checkRateLimit,
  getClientKey,
  validateSavedEvalRequest,
} from "@/lib/security";

// Never prerender / cache: fans out two paid LLM calls (derive + judge) per item.
export const dynamic = "force-dynamic";

// Derive + judge per item, run in parallel, but a batch can still be large —
// give it the same headroom as the gold-set run.
const REQUEST_TIMEOUT_MS = 120_000;

function json<T>(body: T, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Grade previously generated + saved interview answers. The client posts the
 * saved question/answer pairs; the server derives an independent reference for
 * each question and judges the saved answer against it, returning a standard
 * EvalRun with precision / recall / FPR.
 */
export async function POST(request: Request): Promise<Response> {
  // Shares the expensive-eval rate policy with the gold-set run.
  const rate = checkRateLimit(`eval:${getClientKey(request)}`);
  if (!rate.allowed) {
    return json<ApiError>(
      { error: "Too many evaluation runs. Please slow down." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json<ApiError>({ error: "Invalid JSON body." }, 400);
  }

  const validated = validateSavedEvalRequest(body);
  if (!validated.ok) {
    return json<ApiError>({ error: validated.error }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result: EvalRun = await runSavedEvaluation(
      validated.data.items,
      validated.data.settings,
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
