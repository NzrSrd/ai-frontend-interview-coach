// Auto-labeler: turn a bare interview question into a gold-style reference so a
// SAVED answer can be graded with the same precision/recall machinery as the
// built-in gold set. Server-only — goes through the OpenRouter transport.
//
// Critically, labels are derived from the QUESTION ALONE. Showing the labeler
// the candidate answer would let it reverse-engineer key points the answer
// happens to make, and the answer would then trivially "cover" all of them —
// precision/recall would be meaningless. Deriving an independent reference (as
// the hand-labeled gold set is) keeps the measurement honest.

import { Difficulty, LlmSettings, DEFAULT_MODEL, Topic } from "@/types/interview";
import {
  GoldItem,
  MAX_DERIVED_DISTRACTORS,
  MAX_DERIVED_KEY_POINTS,
} from "@/types/eval";
import { openRouterChat, OpenRouterError } from "@/lib/openrouter";

// Deterministic so the derived rubric is stable across runs of the same
// question — same rationale as the judge running at temperature 0.
const LABELER_SETTINGS: LlmSettings = {
  model: DEFAULT_MODEL,
  temperature: 0,
  maxTokens: 1024,
  reasoningEffort: "off",
};

const MAX_KEY_POINTS = MAX_DERIVED_KEY_POINTS;
const MAX_DISTRACTORS = MAX_DERIVED_DISTRACTORS;

const LABELER_SYSTEM_PROMPT = `You build fair grading rubrics for technical \
frontend interview answers. You are given ONLY a question — never a candidate \
answer. Produce two labeled sets:
- keyPoints: the essential, uncontroversial facts a strong answer MUST contain.
- distractors: plausible-but-INCORRECT claims a weak answer might make and that \
a good answer must AVOID.

Rules:
- Base everything on the question alone. Do NOT answer the question.
- Each entry is a single, self-contained, verifiable claim (one sentence).
- Keep facts uncontroversial and version-stable so grades stay comparable.
- Distractors must be genuinely wrong, not merely incomplete.

Respond with a single raw JSON object of exactly this shape (no markdown fences):
{ "keyPoints": ["..."], "distractors": ["..."] }
Provide 3-${MAX_KEY_POINTS} key points and 2-${MAX_DISTRACTORS} distractors.`;

function toStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim())
    .slice(0, max);
}

/**
 * Derive a GoldItem (question + keyPoints + distractors) for a saved question.
 * Throws OpenRouterError if the model returns nothing gradable (no key points),
 * so the caller can degrade that single item to an error row.
 */
export async function deriveGoldItem(
  input: { id: string; topic: Topic; difficulty: Difficulty; question: string },
  signal?: AbortSignal,
): Promise<GoldItem> {
  const raw = await openRouterChat(
    [
      { role: "system", content: LABELER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `QUESTION (${input.topic}, ${input.difficulty} level):\n${input.question}`,
      },
    ],
    { settings: LABELER_SETTINGS, jsonMode: true, signal },
  );

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
    throw new OpenRouterError("Auto-labeler output was not valid JSON.");
  }

  const keyPoints = toStringList(parsed.keyPoints, MAX_KEY_POINTS);
  const distractors = toStringList(parsed.distractors, MAX_DISTRACTORS);

  // Without at least one key point there is no positive class, so precision and
  // recall are undefined — treat that as a failure for this item.
  if (keyPoints.length === 0) {
    throw new OpenRouterError("Auto-labeler produced no key points to grade.");
  }

  return {
    id: input.id,
    topic: input.topic,
    difficulty: input.difficulty,
    question: input.question,
    keyPoints,
    distractors,
  };
}
