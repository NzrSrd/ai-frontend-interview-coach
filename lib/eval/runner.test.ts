import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GoldItem } from "@/types/eval";

// Mock only the transport; keep the real OpenRouterError class so the runner's
// `instanceof` checks still work.
vi.mock("@/lib/openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter")>();
  return { ...actual, openRouterChat: vi.fn() };
});

import { openRouterChat, OpenRouterError } from "@/lib/openrouter";
import { judgeAnswer, evaluateItem, runEvaluation } from "@/lib/eval/runner";
import { GOLD_SET } from "@/lib/eval/goldset";
import { DEFAULT_LLM_SETTINGS } from "@/types/interview";

const mockChat = vi.mocked(openRouterChat);

/** A judge verdict JSON covering the first N indices (safe superset). */
function fullCoverJudge(): string {
  const idx = Array.from({ length: 10 }, (_, i) => i);
  return JSON.stringify({
    keyPoints: idx.map((i) => ({ index: i, covered: true })),
    distractors: idx.map((i) => ({ index: i, asserted: false })),
    unsupportedClaims: [],
  });
}

const sampleItem: GoldItem = {
  id: "sample",
  topic: "React",
  difficulty: "mid",
  question: "Q?",
  keyPoints: ["kp0", "kp1"],
  distractors: ["d0", "d1"],
};

beforeEach(() => {
  mockChat.mockReset();
});

describe("judgeAnswer / parseJudge", () => {
  it("aligns judge verdicts to the gold item by index", async () => {
    mockChat.mockResolvedValueOnce(
      JSON.stringify({
        keyPoints: [
          { index: 0, covered: true },
          { index: 1, covered: false },
        ],
        distractors: [
          { index: 0, asserted: false },
          { index: 1, asserted: true },
        ],
        unsupportedClaims: ["a made-up claim"],
      }),
    );
    const graded = await judgeAnswer(sampleItem, "the answer");
    expect(graded.keyPointResults).toEqual([
      { point: "kp0", covered: true },
      { point: "kp1", covered: false },
    ]);
    expect(graded.distractorResults).toEqual([
      { claim: "d0", asserted: false },
      { claim: "d1", asserted: true },
    ]);
    expect(graded.unsupportedClaims).toEqual(["a made-up claim"]);
  });

  it("defaults missing verdicts to the conservative outcome", async () => {
    // Judge omits key point 1 and both distractors entirely.
    mockChat.mockResolvedValueOnce(
      JSON.stringify({ keyPoints: [{ index: 0, covered: true }] }),
    );
    const graded = await judgeAnswer(sampleItem, "answer");
    // Missing key point -> not covered; missing distractors -> not asserted.
    expect(graded.keyPointResults[1].covered).toBe(false);
    expect(graded.distractorResults.every((d) => !d.asserted)).toBe(true);
    expect(graded.unsupportedClaims).toEqual([]);
  });

  it("strips markdown fences before parsing", async () => {
    mockChat.mockResolvedValueOnce(
      "```json\n" +
        JSON.stringify({
          keyPoints: [{ index: 0, covered: true }],
          distractors: [],
        }) +
        "\n```",
    );
    const graded = await judgeAnswer(sampleItem, "answer");
    expect(graded.keyPointResults[0].covered).toBe(true);
  });

  it("throws OpenRouterError on invalid judge JSON", async () => {
    mockChat.mockResolvedValueOnce("this is not json");
    await expect(judgeAnswer(sampleItem, "answer")).rejects.toThrow(
      OpenRouterError,
    );
  });
});

describe("evaluateItem", () => {
  it("produces a full result with a confusion matrix on success", async () => {
    mockChat.mockImplementation((_messages, options) =>
      Promise.resolve(
        options?.jsonMode ? fullCoverJudge() : "generated answer",
      ),
    );
    const result = await evaluateItem(
      sampleItem,
      DEFAULT_LLM_SETTINGS,
      "zero-shot",
    );
    expect(result.error).toBeUndefined();
    expect(result.generatedAnswer).toBe("generated answer");
    expect(result.matrix.truePositives).toBe(2); // both key points covered
    expect(result.matrix.falsePositives).toBe(0); // no distractors asserted
  });

  it("degrades a failed item to an error row instead of throwing", async () => {
    mockChat.mockRejectedValue(new OpenRouterError("upstream is down"));
    const result = await evaluateItem(
      sampleItem,
      DEFAULT_LLM_SETTINGS,
      "zero-shot",
    );
    expect(result.error).toBe("upstream is down");
    expect(result.generatedAnswer).toBe("");
  });

  it("re-throws an abort so the whole run can time out", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockChat.mockRejectedValue(abortErr);
    await expect(
      evaluateItem(sampleItem, DEFAULT_LLM_SETTINGS, "zero-shot"),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("runEvaluation", () => {
  it("evaluates the whole gold set and micro-averages successes", async () => {
    mockChat.mockImplementation((_messages, options) =>
      Promise.resolve(options?.jsonMode ? fullCoverJudge() : "answer"),
    );
    const run = await runEvaluation(DEFAULT_LLM_SETTINGS, "zero-shot");
    expect(run.items).toHaveLength(GOLD_SET.length);
    expect(run.aggregate.evaluated).toBe(GOLD_SET.length);
    expect(run.aggregate.total).toBe(GOLD_SET.length);
    // Every key point covered, no distractor asserted -> perfect precision/recall.
    expect(run.aggregate.metrics.precision).toBe(1);
    expect(run.aggregate.metrics.recall).toBe(1);
    expect(run.strategy).toBe("zero-shot");
  });

  it("excludes error rows from the aggregate", async () => {
    mockChat.mockRejectedValue(new OpenRouterError("all down"));
    const run = await runEvaluation(DEFAULT_LLM_SETTINGS, "zero-shot");
    expect(run.aggregate.evaluated).toBe(0);
    expect(run.aggregate.total).toBe(GOLD_SET.length);
    expect(run.items.every((i) => i.error)).toBe(true);
  });
});
