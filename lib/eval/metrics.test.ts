import { describe, it, expect } from "vitest";
import {
  EMPTY_MATRIX,
  toConfusionMatrix,
  addMatrices,
  computeMetrics,
  formatMetric,
} from "@/lib/eval/metrics";
import type { ConfusionMatrix } from "@/types/eval";

describe("toConfusionMatrix", () => {
  it("counts covered key points as TP and missed as FN", () => {
    const m = toConfusionMatrix(
      [
        { point: "a", covered: true },
        { point: "b", covered: false },
      ],
      [],
    );
    expect(m.truePositives).toBe(1);
    expect(m.falseNegatives).toBe(1);
    expect(m.falsePositives).toBe(0);
    expect(m.trueNegatives).toBe(0);
  });

  it("counts asserted distractors as FP and avoided as TN", () => {
    const m = toConfusionMatrix(
      [],
      [
        { claim: "x", asserted: true },
        { claim: "y", asserted: false },
      ],
    );
    expect(m.falsePositives).toBe(1);
    expect(m.trueNegatives).toBe(1);
  });

  it("returns an all-zero matrix for empty verdicts", () => {
    expect(toConfusionMatrix([], [])).toEqual(EMPTY_MATRIX);
  });
});

describe("addMatrices", () => {
  it("sums matrices field-by-field (micro-average building block)", () => {
    const a: ConfusionMatrix = {
      truePositives: 1,
      falseNegatives: 2,
      falsePositives: 3,
      trueNegatives: 4,
    };
    const b: ConfusionMatrix = {
      truePositives: 10,
      falseNegatives: 20,
      falsePositives: 30,
      trueNegatives: 40,
    };
    expect(addMatrices(a, b)).toEqual({
      truePositives: 11,
      falseNegatives: 22,
      falsePositives: 33,
      trueNegatives: 44,
    });
  });

  it("returns EMPTY_MATRIX when given no matrices", () => {
    expect(addMatrices()).toEqual(EMPTY_MATRIX);
  });
});

describe("computeMetrics", () => {
  it("computes precision, recall, FPR, F1, and accuracy", () => {
    const m: ConfusionMatrix = {
      truePositives: 8,
      falseNegatives: 2,
      falsePositives: 2,
      trueNegatives: 8,
    };
    const metrics = computeMetrics(m);
    expect(metrics.precision).toBeCloseTo(0.8);
    expect(metrics.recall).toBeCloseTo(0.8);
    expect(metrics.falsePositiveRate).toBeCloseTo(0.2);
    expect(metrics.f1).toBeCloseTo(0.8);
    expect(metrics.accuracy).toBeCloseTo(0.8);
  });

  it("returns null for metrics with a zero denominator", () => {
    // No positive-class predictions or actuals at all.
    const metrics = computeMetrics(EMPTY_MATRIX);
    expect(metrics.precision).toBeNull();
    expect(metrics.recall).toBeNull();
    expect(metrics.falsePositiveRate).toBeNull();
    expect(metrics.f1).toBeNull();
    expect(metrics.accuracy).toBeNull();
  });

  it("returns null F1 when precision and recall are both defined zeros", () => {
    // tp=0 with fp>0 and fn>0: precision=0, recall=0, so p+r===0 -> f1 null.
    // (Documented current behavior; see technical-review metrics.ts:77.)
    const m: ConfusionMatrix = {
      truePositives: 0,
      falseNegatives: 1,
      falsePositives: 1,
      trueNegatives: 1,
    };
    const metrics = computeMetrics(m);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBeNull();
  });

  it("gives perfect scores for a flawless matrix", () => {
    const m: ConfusionMatrix = {
      truePositives: 5,
      falseNegatives: 0,
      falsePositives: 0,
      trueNegatives: 5,
    };
    const metrics = computeMetrics(m);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.falsePositiveRate).toBe(0);
    expect(metrics.f1).toBe(1);
    expect(metrics.accuracy).toBe(1);
  });
});

describe("formatMetric", () => {
  it("formats a ratio as a one-decimal percentage", () => {
    expect(formatMetric(0.8)).toBe("80.0%");
    expect(formatMetric(0.125)).toBe("12.5%");
    expect(formatMetric(1)).toBe("100.0%");
    expect(formatMetric(0)).toBe("0.0%");
  });

  it("renders null as an em dash", () => {
    expect(formatMetric(null)).toBe("—");
  });
});
