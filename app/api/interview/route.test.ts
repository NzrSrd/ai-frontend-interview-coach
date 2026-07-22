import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();
  return { ...actual, streamInterview: vi.fn() };
});

import { POST } from "./route";
import { streamInterview, OpenRouterError } from "@/lib/openrouter";

const mockStream = vi.mocked(streamInterview);

function req(body: unknown, ip: string, rawBody?: string): Request {
  return new Request("http://localhost/api/interview", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: rawBody ?? JSON.stringify(body),
  });
}

const validBody = { topic: "React", difficulty: "mid", count: 2 };

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

beforeEach(() => mockStream.mockReset());

describe("POST /api/interview", () => {
  it("streams a 200 text/plain response on success", async () => {
    mockStream.mockResolvedValueOnce(textStream("hello"));
    const res = await POST(req(validBody, "ip-200"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("hello");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req(null, "ip-badjson", "{ not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 on an invalid body shape", async () => {
    const res = await POST(
      req({ topic: "Rust", difficulty: "mid", count: 2 }, "ip-badshape"),
    );
    expect(res.status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    mockStream.mockResolvedValue(textStream("x"));
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) last = await POST(req(validBody, "ip-429"));
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
  });

  it("maps an OpenRouterError to 502", async () => {
    mockStream.mockRejectedValueOnce(new OpenRouterError("upstream"));
    const res = await POST(req(validBody, "ip-502"));
    expect(res.status).toBe(502);
  });

  it("maps an abort/timeout to 504", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockStream.mockRejectedValueOnce(abortErr);
    const res = await POST(req(validBody, "ip-504"));
    expect(res.status).toBe(504);
  });
});
