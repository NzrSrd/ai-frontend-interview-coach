import type { ApiError } from "@/types/interview";
import { streamInterview, OpenRouterError } from "@/lib/openrouter";
import {
  checkRateLimit,
  getClientKey,
  validateInterviewRequest,
} from "@/lib/security";

// Never prerender / cache: this hits a paid LLM and depends on the request body.
export const dynamic = "force-dynamic";

/** Upper bound on the upstream LLM call. */
const REQUEST_TIMEOUT_MS = 45_000;

function json<T>(body: T, status: number, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  // 1. Rate limit before doing any work.
  const rate = checkRateLimit(getClientKey(request));
  if (!rate.allowed) {
    return json<ApiError>(
      { error: "Too many requests. Please slow down." },
      429,
      { "Retry-After": String(rate.retryAfter) },
    );
  }

  // 2. Parse + validate the untrusted body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json<ApiError>({ error: "Invalid JSON body." }, 400);
  }

  const validated = validateInterviewRequest(body);
  if (!validated.ok) {
    return json<ApiError>({ error: validated.error }, 400);
  }

  // 3. Open the streaming model call. It's aborted by a hard timeout OR by the
  //    client disconnecting (`request.signal`); `AbortSignal.timeout` is managed
  //    by the runtime, so there's no timer to clean up. Connection-time failures
  //    (bad key, upstream 5xx, timeout before the first byte) surface here as a
  //    real HTTP status. Once the stream is returned the 200 is committed, so a
  //    mid-stream truncation just ends the body — the client renders whatever
  //    arrived instead of failing.
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ]);

  try {
    const stream = await streamInterview(validated.data, signal);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Defeat proxy/CDN response buffering so chunks flush progressively.
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    // Both an AbortController abort and an AbortSignal.timeout land here; the
    // latter throws a DOMException named "TimeoutError".
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
      return json<ApiError>(
        { error: "Failed to generate interview questions." },
        502,
      );
    }
    return json<ApiError>({ error: "Unexpected server error." }, 500);
  }
}
