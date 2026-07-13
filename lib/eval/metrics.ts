// Pure metric math for the eval harness. No I/O, no imports beyond types, so
// it's trivially unit-testable and safe to run on client or server.

import {
  ConfusionMatrix,
  DistractorResult,
  KeyPointResult,
  Metrics,
} from "@/types/eval";

/** An all-zero confusion matrix, the identity for `addMatrices`. */
export const EMPTY_MATRIX: ConfusionMatrix = {
  truePositives: 0,
  falseNegatives: 0,
  falsePositives: 0,
  trueNegatives: 0,
};

/** Build a per-item confusion matrix from the judge's verdicts. */
export function toConfusionMatrix(
  keyPointResults: KeyPointResult[],
  distractorResults: DistractorResult[],
): ConfusionMatrix {
  let truePositives = 0;
  let falseNegatives = 0;
  for (const kp of keyPointResults) {
    if (kp.covered) truePositives++;
    else falseNegatives++;
  }

  let falsePositives = 0;
  let trueNegatives = 0;
  for (const d of distractorResults) {
    if (d.asserted) falsePositives++;
    else trueNegatives++;
  }

  return { truePositives, falseNegatives, falsePositives, trueNegatives };
}

/** Sum any number of matrices (used to micro-average across items). */
export function addMatrices(...matrices: ConfusionMatrix[]): ConfusionMatrix {
  return matrices.reduce(
    (acc, m) => ({
      truePositives: acc.truePositives + m.truePositives,
      falseNegatives: acc.falseNegatives + m.falseNegatives,
      falsePositives: acc.falsePositives + m.falsePositives,
      trueNegatives: acc.trueNegatives + m.trueNegatives,
    }),
    EMPTY_MATRIX,
  );
}

/** Divide, returning null when the denominator is zero (undefined metric). */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Derive precision, recall, FPR, F1, and accuracy from a confusion matrix.
 * Micro-averaging is achieved by summing item matrices first (see addMatrices),
 * then calling this once on the total.
 */
export function computeMetrics(m: ConfusionMatrix): Metrics {
  const { truePositives: tp, falseNegatives: fn, falsePositives: fp, trueNegatives: tn } = m;

  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const falsePositiveRate = ratio(fp, fp + tn);

  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  const accuracy = ratio(tp + tn, tp + tn + fp + fn);

  return { precision, recall, falsePositiveRate, f1, accuracy };
}

/** Format a metric in [0,1] as a percentage string, or an em dash if null. */
export function formatMetric(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
