import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openRouterChat, streamChat, OpenRouterError } from "@/lib/openrouter";

const fetchMock = vi.fn();

/** A successful non-streaming completion Response. */
function chatOk(content: string, finishReason = "stop"): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: finishReason }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("openRouterChat", () => {
  it("throws when the API key is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(
      openRouterChat([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(OpenRouterError);
  });

  it("returns the assistant content on success", async () => {
    fetchMock.mockResolvedValueOnce(chatOk("the answer"));
    const out = await openRouterChat([{ role: "user", content: "q" }]);
    expect(out).toBe("the answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast (no retry) on a non-retryable 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad key", { status: 401 }));
    await expect(
      openRouterChat([{ role: "user", content: "q" }]),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an actionable error on finish_reason 'length' without retrying", async () => {
    fetchMock.mockResolvedValueOnce(chatOk("", "length"));
    await expect(
      openRouterChat([{ role: "user", content: "q" }]),
    ).rejects.toThrow(/ran out of tokens/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 500 then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response("upstream", { status: 500 }))
      .mockResolvedValueOnce(chatOk("recovered"));
    const p = openRouterChat([{ role: "user", content: "q" }]);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries sporadic empty completions up to MAX_ATTEMPTS then throws", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(chatOk("")); // always empty, no finish_reason
    const p = openRouterChat([{ role: "user", content: "q" }]);
    // Attach a rejection handler before advancing so the rejection isn't unhandled.
    const assertion = expect(p).rejects.toThrow(OpenRouterError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("propagates an abort without retrying", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortErr);
    await expect(
      openRouterChat([{ role: "user", content: "q" }]),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors the OPENROUTER_MODEL ops override in the request body", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "openai/override-model");
    fetchMock.mockResolvedValueOnce(chatOk("ok"));
    await openRouterChat([{ role: "user", content: "q" }]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("openai/override-model");
  });
});

describe("streamChat (SSE)", () => {
  it("throws when the API key is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(streamChat([{ role: "user", content: "q" }])).rejects.toThrow(
      OpenRouterError,
    );
  });

  it("yields concatenated deltas, skipping keep-alives and garbled events", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"content":"Hello"}}]}`,
      ``,
      `: keep-alive comment`,
      `data: {not valid json}`,
      `data: {"choices":[{"delta":{"content":" world"}}]}`,
      ``,
      `data: [DONE]`,
      ``,
    ].join("\n");
    fetchMock.mockResolvedValueOnce(new Response(sse, { status: 200 }));

    const stream = await streamChat([{ role: "user", content: "q" }]);
    const text = await new Response(stream).text();
    expect(text).toBe("Hello world");
  });

  it("maps a connection-time 4xx to an OpenRouterError before any bytes", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));
    await expect(streamChat([{ role: "user", content: "q" }])).rejects.toThrow(
      OpenRouterError,
    );
  });

  it("ends the stream gracefully if the body errors mid-stream", async () => {
    // A body that delivers one delta on the first pull then errors on the next —
    // streamChat swallows the error and closes with whatever arrived. (Erroring
    // in the same tick as enqueue would discard the chunk per the Streams spec.)
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: {"choices":[{"delta":{"content":"partial"}}]}\n\n`,
            ),
          );
        } else {
          controller.error(new Error("boom"));
        }
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));

    const stream = await streamChat([{ role: "user", content: "q" }]);
    const text = await new Response(stream).text();
    expect(text).toBe("partial");
  });
});
