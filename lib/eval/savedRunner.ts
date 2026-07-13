// Eval orchestration for SAVED interviews. Unlike the gold-set runner, the
// answer is not generated here — it was generated earlier by the app and stored
// in the browser. For each saved question we derive an independent reference
// (auto-labeler), then grade the saved answer against it with the same judge and
// metric math the gold set uses. Server-only — goes through OpenRouter.

import { DEFAULT_LLM_SETTINGS, LlmSettings } from "@/types/interview";
import { EvalItemResult, EvalRun, GoldItem, SavedEvalItem } from "@/types/eval";
import { DEFAULT_STRATEGY } from "@/lib/prompts/strategies";
import { OpenRouterError } from "@/lib/openrouter";
import { deriveGoldItem } from "@/lib/eval/autolabel";
import { judgeAnswer } from "@/lib/eval/runner";
import {
  addMatrices,
  computeMetrics,
  EMPTY_MATRIX,
  toConfusionMatrix,
} from "@/lib/eval/metrics";

/**
 * Grade one saved question+answer end to end. Never throws (except on abort):
 * a derive/judge failure degrades to an error row so one bad item can't sink
 * the whole run.
 */
export async function evaluateSavedItem(
  item: SavedEvalItem,
  signal?: AbortSignal,
): Promise<EvalItemResult> {
  const base = {
    id: item.id,
    topic: item.topic,
    difficulty: item.difficulty,
    question: item.question,
  };

  try {
    // Reuse cached labels when the client supplied them (skips the derive call);
    // otherwise derive a fresh reference from the question alone.
    const gold: GoldItem = item.labels
      ? {
          id: item.id,
          topic: item.topic,
          difficulty: item.difficulty,
          question: item.question,
          keyPoints: item.labels.keyPoints,
          distractors: item.labels.distractors,
        }
      : await deriveGoldItem(
          {
            id: item.id,
            topic: item.topic,
            difficulty: item.difficulty,
            question: item.question,
          },
          signal,
        );
    const graded = await judgeAnswer(gold, item.answer, signal);
    const matrix = toConfusionMatrix(
      graded.keyPointResults,
      graded.distractorResults,
    );
    // The "answer under test" is the saved answer, not a fresh generation.
    return { ...base, generatedAnswer: item.answer, ...graded, matrix };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    return {
      ...base,
      generatedAnswer: item.answer,
      keyPointResults: [],
      distractorResults: [],
      unsupportedClaims: [],
      matrix: EMPTY_MATRIX,
      error:
        err instanceof OpenRouterError
          ? err.message
          : "Failed to evaluate this item.",
    };
  }
}

/**
 * Grade a batch of saved items. Items run in parallel; failures become error
 * rows. Returns a standard EvalRun so the dashboard can reuse its result panels.
 * `settings` is carried through for display only (it's the config the answers
 * were originally generated under); the judge always runs deterministically.
 */
export async function runSavedEvaluation(
  items: SavedEvalItem[],
  settings: LlmSettings = DEFAULT_LLM_SETTINGS,
  signal?: AbortSignal,
): Promise<EvalRun> {
  const results = await Promise.all(
    items.map((item) => evaluateSavedItem(item, signal)),
  );

  const succeeded = results.filter((item) => !item.error);
  const matrix = addMatrices(...succeeded.map((item) => item.matrix));

  return {
    settings,
    // Saved answers came from the app's main prompt, not an eval strategy;
    // record the default so the EvalRun shape stays valid.
    strategy: DEFAULT_STRATEGY,
    items: results,
    aggregate: {
      matrix,
      metrics: computeMetrics(matrix),
      evaluated: succeeded.length,
      total: results.length,
    },
  };
}
