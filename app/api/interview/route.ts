import type { ApiError, InterviewResponse } from "@/types/interview";
import { generateInterview, OpenRouterError } from "@/lib/openrouter";
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

  // 3. Call the model with a hard timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const result: InterviewResponse = await generateInterview(
      validated.data,
      controller.signal,
    );
    return json<InterviewResponse>(result, 200);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return json<ApiError>({ error: "The request timed out. Try again." }, 504);
    }
    if (err instanceof OpenRouterError) {
      return json<ApiError>(
        { error: "Failed to generate interview questions." },
        502,
      );
    }
    return json<ApiError>({ error: "Unexpected server error." }, 500);
  } finally {
    clearTimeout(timeout);
  }
}