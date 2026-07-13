// Eval orchestration: for each gold item, generate an answer with the app's own
// model (the system under test), then grade it with an LLM judge and derive a
// confusion matrix. Server-only — goes through the OpenRouter transport.

import { DEFAULT_MODEL, LlmSettings } from "@/types/interview";
import {
  DistractorResult,
  EvalItemResult,
  EvalRun,
  GoldItem,
  KeyPointResult,
} from "@/types/eval";
import {
  answerSystemPrompt,
  DEFAULT_STRATEGY,
  PromptStrategy,
} from "@/lib/prompts/strategies";
import { openRouterChat, OpenRouterError } from "@/lib/openrouter";
import { GOLD_SET } from "@/lib/eval/goldset";
import {
  addMatrices,
  computeMetrics,
  EMPTY_MATRIX,
  toConfusionMatrix,
} from "@/lib/eval/metrics";

// The judge runs deterministically (temperature 0) so grades are stable across
// runs; the answer under test is generated with the caller's real settings.
const JUDGE_SETTINGS: LlmSettings = {
  model: DEFAULT_MODEL,
  temperature: 0,
  maxTokens: 2048,
  reasoningEffort: "off",
};

/** Generate the answer that will be graded (the system under test). */
async function generateAnswer(
  item: GoldItem,
  settings: LlmSettings,
  strategy: PromptStrategy,
  signal?: AbortSignal,
): Promise<string> {
  const answer = await openRouterChat(
    [
      { role: "system", content: answerSystemPrompt(strategy) },
      { role: "user", content: item.question },
    ],
    { settings, jsonMode: false, signal },
  );
  return answer.trim();
}

function buildJudgePrompt(item: GoldItem, answer: string): string {
  const keyPoints = item.keyPoints.map((p, i) => `  ${i}. ${p}`).join("\n");
  const distractors = item.distractors.map((d, i) => `  ${i}. ${d}`).join("\n");

  return [
    `QUESTION:\n${item.question}`,
    ``,
    `ANSWER UNDER TEST:\n${answer}`,
    ``,
    `KEY POINTS (facts a correct answer should contain):`,
    keyPoints,
    ``,
    `DISTRACTORS (incorrect claims a good answer should NOT make):`,
    distractors,
    ``,
    `For each KEY POINT, decide whether the answer covers it (in substance, ` +
      `paraphrases are fine). For each DISTRACTOR, decide whether the answer ` +
      `actually asserts that incorrect claim. Also list any clearly incorrect ` +
      `claims the answer makes that are not already in the distractor list.`,
  ].join("\n");
}

const JUDGE_SYSTEM_PROMPT = `You are a strict, fair grader of technical answers. \
Judge only what the answer actually says, not what it implies or what you assume \
the author knows. Reward substance over wording — a correct paraphrase counts as \
covering a key point.

Respond with a single raw JSON object of exactly this shape (no markdown fences):
{
  "keyPoints": [{ "index": 0, "covered": true }],
  "distractors": [{ "index": 0, "asserted": false }],
  "unsupportedClaims": ["string"]
}
Include one entry per provided key point and one per provided distractor, using \
the same index numbers shown. "unsupportedClaims" lists incorrect claims not in \
the distractor list; use an empty array if there are none.`;

interface RawVerdict {
  index?: unknown;
  covered?: unknown;
  asserted?: unknown;
}

/** Build a Map from index -> boolean flag, tolerating malformed entries. */
function verdictMap(
  raw: unknown,
  flag: "covered" | "asserted",
): Map<number, boolean> {
  const map = new Map<number, boolean>();
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const v = entry as RawVerdict;
    if (typeof v.index !== "number" || !Number.isInteger(v.index)) continue;
    map.set(v.index, v[flag] === true);
  }
  return map;
}

/**
 * Parse the judge's untrusted JSON into results aligned to the gold item. Missing
 * or malformed verdicts default to the conservative outcome (key point not
 * covered, distractor not asserted) so a lazy judge can't inflate the score.
 */
function parseJudge(
  item: GoldItem,
  raw: string,
): {
  keyPointResults: KeyPointResult[];
  distractorResults: DistractorResult[];
  unsupportedClaims: string[];
} {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(cleaned);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    parsed = value as Record<string, unknown>;
  } catch {
    throw new OpenRouterError("Judge output was not valid JSON.");
  }

  const covered = verdictMap(parsed.keyPoints, "covered");
  const asserted = verdictMap(parsed.distractors, "asserted");

  const keyPointResults: KeyPointResult[] = item.keyPoints.map((point, i) => ({
    point,
    covered: covered.get(i) ?? false,
  }));

  const distractorResults: DistractorResult[] = item.distractors.map(
    (claim, i) => ({
      claim,
      asserted: asserted.get(i) ?? false,
    }),
  );

  const unsupportedClaims = Array.isArray(parsed.unsupportedClaims)
    ? parsed.unsupportedClaims
        .filter((c): c is string => typeof c === "string" && c.trim() !== "")
        .map((c) => c.trim())
        .slice(0, 10)
    : [];

  return { keyPointResults, distractorResults, unsupportedClaims };
}

/** Ask the judge to grade a single generated answer. */
export async function judgeAnswer(
  item: GoldItem,
  answer: string,
  signal?: AbortSignal,
): Promise<
  Omit<
    EvalItemResult,
    "id" | "topic" | "difficulty" | "question" | "generatedAnswer" | "matrix"
  >
> {
  const raw = await openRouterChat(
    [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: buildJudgePrompt(item, answer) },
    ],
    { settings: JUDGE_SETTINGS, jsonMode: true, signal },
  );
  return parseJudge(item, raw);
}

/** Evaluate one gold item end to end. Never throws; failures become error rows. */
export async function evaluateItem(
  item: GoldItem,
  settings: LlmSettings,
  strategy: PromptStrategy,
  signal?: AbortSignal,
): Promise<EvalItemResult> {
  const base = {
    id: item.id,
    topic: item.topic,
    difficulty: item.difficulty,
    question: item.question,
  };

  try {
    const generatedAnswer = await generateAnswer(
      item,
      settings,
      strategy,
      signal,
    );
    const graded = await judgeAnswer(item, generatedAnswer, signal);
    const matrix = toConfusionMatrix(
      graded.keyPointResults,
      graded.distractorResults,
    );
    return { ...base, generatedAnswer, ...graded, matrix };
  } catch (err) {
    // Re-throw aborts so the route can map the whole run to a timeout.
    if (err instanceof Error && err.name === "AbortError") throw err;
    return {
      ...base,
      generatedAnswer: "",
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
 * Run the full gold set. Items run in parallel; a single item failing degrades
 * to an error row rather than sinking the whole run. Aggregate metrics are
 * micro-averaged over the successfully evaluated items only.
 */
export async function runEvaluation(
  settings: LlmSettings,
  strategy: PromptStrategy = DEFAULT_STRATEGY,
  signal?: AbortSignal,
): Promise<EvalRun> {
  const items = await Promise.all(
    GOLD_SET.map((item) => evaluateItem(item, settings, strategy, signal)),
  );

  const succeeded = items.filter((item) => !item.error);
  const matrix = addMatrices(...succeeded.map((item) => item.matrix));

  return {
    settings,
    strategy,
    items,
    aggregate: {
      matrix,
      metrics: computeMetrics(matrix),
      evaluated: succeeded.length,
      total: items.length,
    },
  };
}
