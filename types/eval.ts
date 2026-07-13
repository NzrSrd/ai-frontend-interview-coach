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

import {
  Difficulty,
  InterviewQuestion,
  LlmSettings,
  Topic,
} from "@/types/interview";

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

// --- Saving generated interviews for later evaluation ----------------------
// Generated interviews (from POST /api/interview) are persisted client-side so
// their answers can be graded later. Unlike the gold set, saved items carry no
// hand-labeled reference; the eval route derives one from the QUESTION alone
// (never the saved answer, which would leak) before judging.

/**
 * A grading reference derived from a question: the key points a good answer
 * should contain and the distractors it should avoid. Cached in the saved
 * dataset after first eval so the (deterministic) derive call is paid once —
 * re-runs only pay for the judge.
 */
export interface DerivedLabels {
  keyPoints: string[];
  distractors: string[];
}

/** One generated interview persisted in the browser (localStorage). */
export interface SavedInterview {
  id: string;
  /** Epoch ms when it was generated/saved. */
  createdAt: number;
  topic: Topic;
  difficulty: Difficulty;
  /** The model settings the answers were generated under. */
  settings: LlmSettings;
  /** The generated questions, each with its model answer and follow-ups. */
  questions: InterviewQuestion[];
  /**
   * Auto-derived grading labels, cached per question index after an eval run.
   * Keyed by the question's index in `questions`. Absent until first evaluated.
   */
  labels?: Record<number, DerivedLabels>;
}

/** A single saved question+answer pair sent to the eval route for grading. */
export interface SavedEvalItem {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
  question: string;
  /** The saved model answer — this is the text under test. */
  answer: string;
  /**
   * Previously derived labels for this question. When present and valid, the
   * server skips the derive call and judges against these instead.
   */
  labels?: DerivedLabels;
}

/** Request body for POST /api/evaluate/saved. */
export interface SavedEvalRequest {
  items: SavedEvalItem[];
  /** Settings the answers were generated under; shown in results only. */
  settings?: LlmSettings;
}

/** Upper bound on how many saved items a single eval run will grade. */
export const MAX_SAVED_EVAL_ITEMS = 30;
/** Character caps applied server-side before text reaches a model prompt. */
export const MAX_EVAL_QUESTION_LENGTH = 500;
export const MAX_EVAL_ANSWER_LENGTH = 4000;
/** Bounds on a derived reference (shared by the auto-labeler and validation). */
export const MAX_DERIVED_KEY_POINTS = 5;
export const MAX_DERIVED_DISTRACTORS = 4;
