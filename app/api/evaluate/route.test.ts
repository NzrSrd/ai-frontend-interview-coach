import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRun } from "@/types/eval";

vi.mock("@/lib/eval/runner", () => ({ runEvaluation: vi.fn() }));

import { POST } from "./route";
import { runEvaluation } from "@/lib/eval/runner";
import { OpenRouterError } from "@/lib/openrouter";
import { DEFAULT_LLM_SETTINGS } from "@/types/interview";
import { EMPTY_MATRIX } from "@/lib/eval/metrics";

const mockRun = vi.mocked(runEvaluation);

const fakeRun: EvalRun = {
  settings: DEFAULT_LLM_SETTINGS,
  strategy: "zero-shot",
  items: [],
  aggregate: {
    matrix: EMPTY_MATRIX,
    metrics: {
      precision: null,
      recall: null,
      falsePositiveRate: null,
      f1: null,
      accuracy: null,
    },
    evaluated: 0,
    total: 0,
  },
};

function req(ip: string, rawBody?: string): Request {
  return new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: rawBody,
  });
}

beforeEach(() => mockRun.mockReset());

describe("POST /api/evaluate", () => {
  it("runs the gold set and returns 200 with the EvalRun", async () => {
    mockRun.mockResolvedValueOnce(fakeRun);
    const res = await POST(
      req("e-200", JSON.stringify({ strategy: "few-shot" })),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as EvalRun;
    expect(body.strategy).toBe("zero-shot");
    // Strategy from the body is validated and forwarded to the runner.
    expect(mockRun).toHaveBeenCalledWith(
      expect.anything(),
      "few-shot",
      expect.anything(),
    );
  });

  it("tolerates an empty body and falls back to defaults", async () => {
    mockRun.mockResolvedValueOnce(fakeRun);
    const res = await POST(req("e-empty"));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it("returns 400 on a non-empty invalid JSON body", async () => {
    const res = await POST(req("e-badjson", "{ not json"));
    expect(res.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 429 once the eval rate limit is exceeded", async () => {
    mockRun.mockResolvedValue(fakeRun);
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) last = await POST(req("e-429"));
    expect(last!.status).toBe(429);
  });

  it("maps an OpenRouterError to 502", async () => {
    mockRun.mockRejectedValueOnce(new OpenRouterError("upstream"));
    const res = await POST(req("e-502"));
    expect(res.status).toBe(502);
  });

  it("maps an abort/timeout to 504", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockRun.mockRejectedValueOnce(abortErr);
    const res = await POST(req("e-504"));
    expect(res.status).toBe(504);
  });
});
