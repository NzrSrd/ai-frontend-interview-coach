import type { ApiError } from "@/types/interview";
import { streamAnswer, OpenRouterError } from "@/lib/openrouter";
import {
  checkRateLimit,
  getClientKey,
  validateAnswerRequest,
} from "@/lib/security";

// Never prerender / cache: this hits a paid LLM and depends on the request body.
export const dynamic = "force-dynamic";

/** Upper bound on the upstream LLM call. */
const REQUEST_TIMEOUT_MS = 45_000;

function json<T>(body: T, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

/**
 * Stream a model answer to a single follow-up question. Mirrors the interview
 * route: rate-limit + validate up front (real status codes), then hand back a
 * text/plain stream. A mid-stream truncation just ends the body — the client
 * shows whatever arrived instead of failing.
 */
export async function POST(request: Request): Promise<Response> {
  const rate = checkRateLimit(getClientKey(request));
  if (!rate.allowed) {
    return json<ApiError>(
      { error: "Too many requests. Please slow down." },
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

  const validated = validateAnswerRequest(body);
  if (!validated.ok) {
    return json<ApiError>({ error: validated.error }, 400);
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);

  try {
    const stream = await streamAnswer(validated.data, signal);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError")
    ) {
      return json<ApiError>(
        { error: "The request timed out. Try again." },
        504,
      );
    }
    if (err instanceof OpenRouterError) {
      return json<ApiError>({ error: "Failed to generate an answer." }, 502);
    }
    return json<ApiError>({ error: "Unexpected server error." }, 500);
  }
}
