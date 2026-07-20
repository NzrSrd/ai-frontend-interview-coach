import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();
  return { ...actual, streamAnswer: vi.fn() };
});

import { POST } from "./route";
import { streamAnswer, OpenRouterError } from "@/lib/openrouter";

const mockStream = vi.mocked(streamAnswer);

function req(body: unknown, ip: string, rawBody?: string): Request {
  return new Request("http://localhost/api/answer", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: rawBody ?? JSON.stringify(body),
  });
}

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
}

beforeEach(() => mockStream.mockReset());

describe("POST /api/answer", () => {
  it("streams a 200 response for a valid question", async () => {
    mockStream.mockResolvedValueOnce(textStream("an answer"));
    const res = await POST(req({ question: "What is hoisting?" }, "a-200"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("an answer");
  });

  it("returns 400 for a missing/empty question", async () => {
    const res = await POST(req({ question: "   " }, "a-400"));
    expect(res.status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req(null, "a-badjson", "nope"));
    expect(res.status).toBe(400);
  });

  it("maps an OpenRouterError to 502", async () => {
    mockStream.mockRejectedValueOnce(new OpenRouterError("upstream"));
    const res = await POST(req({ question: "Q?" }, "a-502"));
    expect(res.status).toBe(502);
  });

  it("maps an abort/timeout to 504", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "TimeoutError";
    mockStream.mockRejectedValueOnce(abortErr);
    const res = await POST(req({ question: "Q?" }, "a-504"));
    expect(res.status).toBe(504);
  });
});
