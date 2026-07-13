// Types for the evaluation harness. The harness treats the app's OWN output as
// the system under test: it generates an answer for each gold question, then an
// LLM judge grades that answer against a labeled reference, from which we derive
// a confusion matrix and precision / recall / FPR.
//
// The metric definitions hinge on two labeled sets per gold item:
//   - keyPoints:  facts a correct answer SHOULD contain  -> the positive class
//   - distractors: plausible-but-wrong claims it should AVOID -> the negative class
// so precision, recall, and FPR all derive from one coherent confusion matrix.
// Kept free of runtime/Node imports so it can be bundled into client code.

import { Difficulty, Topic } from "@/types/interview";

/** A single labeled reference item the model is graded against. */
export interface GoldItem {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  /** The exact interview question to ask, so runs are reproducible. */
  question: string;
  /** Facts a strong answer must contain (positive class). */
  keyPoints: string[];
  /** Plausible-but-wrong claims a good answer must avoid (negative class). */
  distractors: string[];
}

/** One key point's verdict from the judge. */
export interface KeyPointResult {
  point: string;
  /** True if the generated answer covered this point (true positive). */
  covered: boolean;
}

/** One distractor's verdict from the judge. */
export interface DistractorResult {
  claim: string;
  /** True if the generated answer wrongly asserted this claim (false positive). */
  asserted: boolean;
}

/**
 * Counts for a single item or an aggregate. Positives come from keyPoints,
 * negatives from distractors:
 *   TP = keyPoints covered      FN = keyPoints missed
 *   FP = distractors asserted   TN = distractors avoided
 */
export interface ConfusionMatrix {
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  trueNegatives: number;
}

/**
 * Derived scores. `null` where the denominator is zero (undefined metric) so
 * the UI can render an em dash instead of a misleading 0.
 */
export interface Metrics {
  precision: number | null;
  recall: number | null;
  /** False positive rate: FP / (FP + TN). */
  falsePositiveRate: number | null;
  f1: number | null;
  accuracy: number | null;
}

/** Result of evaluating one gold item end to end. */
export interface EvalItemResult {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  question: string;
  /** The answer the app's model produced (what's under test). */
  generatedAnswer: string;
  keyPointResults: KeyPointResult[];
  distractorResults: DistractorResult[];
  /**
   * Claims the answer made that are wrong but not in the distractor list.
   * Surfaced for insight only; excluded from the matrix so precision/recall/FPR
   * stay consistent over the fixed keyPoints/distractors universe.
   */
  unsupportedClaims: string[];
  matrix: ConfusionMatrix;
  /** Set when this item failed to generate/judge; other fields are empty. */
  error?: string;
}

/** Full response from `POST /api/evaluate`: per-item results + aggregate. */
export interface EvalRun {
  /** The settings the answers were generated under. */
  settings: import("@/types/interview").LlmSettings;
  /** The prompt strategy the answers were generated with. */
  strategy: import("@/lib/prompts/strategies").PromptStrategy;
  items: EvalItemResult[];
  aggregate: {
    matrix: ConfusionMatrix;
    metrics: Metrics;
    /** How many gold items were successfully evaluated (excludes errors). */
    evaluated: number;
    total: number;
  };
}
