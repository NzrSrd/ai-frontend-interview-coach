import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SavedEvalItem, GoldItem } from "@/types/eval";

vi.mock("@/lib/eval/autolabel", () => ({ deriveGoldItem: vi.fn() }));
vi.mock("@/lib/eval/runner", () => ({ judgeAnswer: vi.fn() }));

import { deriveGoldItem } from "@/lib/eval/autolabel";
import { judgeAnswer } from "@/lib/eval/runner";
import { OpenRouterError } from "@/lib/openrouter";
import { evaluateSavedItem, runSavedEvaluation } from "@/lib/eval/savedRunner";

const mockDerive = vi.mocked(deriveGoldItem);
const mockJudge = vi.mocked(judgeAnswer);

const baseItem: SavedEvalItem = {
  id: "iv1-q0",
  topic: "React",
  difficulty: "mid",
  question: "What is the virtual DOM?",
  answer: "An in-memory representation of the UI.",
};

const goodGraded = {
  keyPointResults: [{ point: "kp", covered: true }],
  distractorResults: [{ claim: "d", asserted: false }],
  unsupportedClaims: [],
};

beforeEach(() => {
  mockDerive.mockReset();
  mockJudge.mockReset();
});

describe("evaluateSavedItem", () => {
  it("uses cached labels and skips the derive call", async () => {
    mockJudge.mockResolvedValueOnce(goodGraded);
    const item: SavedEvalItem = {
      ...baseItem,
      labels: { keyPoints: ["kp"], distractors: ["d"] },
    };
    const result = await evaluateSavedItem(item);

    expect(mockDerive).not.toHaveBeenCalled();
    // Judge is graded against a gold item built from the cached labels.
    const gold = mockJudge.mock.calls[0][0] as GoldItem;
    expect(gold.keyPoints).toEqual(["kp"]);
    expect(result.error).toBeUndefined();
    expect(result.generatedAnswer).toBe(baseItem.answer);
    expect(result.matrix.truePositives).toBe(1);
  });

  it("derives a fresh reference when no labels are cached", async () => {
    mockDerive.mockResolvedValueOnce({
      ...baseItem,
      keyPoints: ["derived kp"],
      distractors: ["derived d"],
    });
    mockJudge.mockResolvedValueOnce(goodGraded);

    const result = await evaluateSavedItem(baseItem);
    expect(mockDerive).toHaveBeenCalledOnce();
    expect(result.error).toBeUndefined();
  });

  it("degrades a derive/judge failure to an error row", async () => {
    mockDerive.mockRejectedValueOnce(new OpenRouterError("labeler failed"));
    const result = await evaluateSavedItem(baseItem);
    expect(result.error).toBe("labeler failed");
    expect(result.generatedAnswer).toBe(baseItem.answer); // saved answer preserved
  });

  it("re-throws an abort", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    mockDerive.mockRejectedValueOnce(abortErr);
    await expect(evaluateSavedItem(baseItem)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("runSavedEvaluation", () => {
  it("grades a batch and micro-averages successes", async () => {
    mockDerive.mockResolvedValue({
      ...baseItem,
      keyPoints: ["kp"],
      distractors: ["d"],
    });
    mockJudge.mockResolvedValue(goodGraded);

    const run = await runSavedEvaluation([
      baseItem,
      { ...baseItem, id: "iv1-q1" },
    ]);
    expect(run.items).toHaveLength(2);
    expect(run.aggregate.evaluated).toBe(2);
    expect(run.strategy).toBe("zero-shot"); // recorded default for saved runs
  });
});
