import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalRun } from "@/types/eval";

vi.mock("@/lib/eval/savedRunner", () => ({ runSavedEvaluation: vi.fn() }));

import { POST } from "./route";
import { runSavedEvaluation } from "@/lib/eval/savedRunner";
import { OpenRouterError } from "@/lib/openrouter";
import { DEFAULT_LLM_SETTINGS } from "@/types/interview";
import { EMPTY_MATRIX } from "@/lib/eval/metrics";

const mockRun = vi.mocked(runSavedEvaluation);

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

const validItem = {
  id: "iv1-q0",
  topic: "React",
  difficulty: "mid",
  question: "What is the virtual DOM?",
  answer: "An in-memory representation of the UI.",
};

function req(body: unknown, ip: string, rawBody?: string): Request {
  return new Request("http://localhost/api/evaluate/saved", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: rawBody ?? JSON.stringify(body),
  });
}

beforeEach(() => mockRun.mockReset());

describe("POST /api/evaluate/saved", () => {
  it("grades a valid batch and returns 200", async () => {
    mockRun.mockResolvedValueOnce(fakeRun);
    const res = await POST(req({ items: [validItem] }, "s-200"));
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledOnce();
  });

  it("returns 400 for an empty items array", async () => {
    const res = await POST(req({ items: [] }, "s-empty"));
    expect(res.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req(null, "s-badjson", "nope"));
    expect(res.status).toBe(400);
  });

  it("maps an OpenRouterError to 502", async () => {
    mockRun.mockRejectedValueOnce(new OpenRouterError("upstream"));
    const res = await POST(req({ items: [validItem] }, "s-502"));
    expect(res.status).toBe(502);
  });

  it("maps an abort/timeout to 504", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockRun.mockRejectedValueOnce(abortErr);
    const res = await POST(req({ items: [validItem] }, "s-504"));
    expect(res.status).toBe(504);
  });
});
