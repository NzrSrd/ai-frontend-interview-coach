// Wire format for streamed interview generation, shared by the server prompt
// and the client renderer. Keep it free of any runtime/Node imports so it can be
// bundled into client components.
//
// Instead of a single JSON object (which cannot be rendered until it is complete
// and fails to parse if `max_tokens` truncates it mid-object), the model emits a
// flat, delimiter-separated block per question:
//
//   <<<QUESTION>>>
//   ...question text...
//   <<<ANSWER>>>
//   ...answer text (may span paragraphs)...
//   <<<FOLLOWUPS>>>
//   - follow-up one
//   - follow-up two
//   <<<END>>>
//
// This streams token-by-token and degrades gracefully: a truncated response just
// yields a shorter answer or fewer questions, never a hard parse error.

import type { InterviewQuestion } from "@/types/interview";
import { MAX_QUESTIONS } from "@/types/interview";

export const MARKERS = {
  question: "<<<QUESTION>>>",
  answer: "<<<ANSWER>>>",
  followUps: "<<<FOLLOWUPS>>>",
  end: "<<<END>>>",
} as const;

const ALL_MARKERS = Object.values(MARKERS);

/** A question parsed from a (possibly still-streaming) response. */
export interface ParsedQuestion extends InterviewQuestion {
  /** True once the block's `<<<END>>>` marker has been seen. */
  complete: boolean;
}

/**
 * If `text` ends with the start of a marker (e.g. the stream has delivered
 * "<<<ANS" but not the rest yet), drop that dangling fragment so it doesn't
 * flicker into the rendered content. Only trims a suffix that is a strict prefix
 * of a marker — a fully-formed marker is handled by the split logic instead.
 */
function stripTrailingPartialMarker(text: string): string {
  for (const marker of ALL_MARKERS) {
    // Try the longest possible partial first so we trim as much as needed.
    for (let len = marker.length - 1; len > 0; len--) {
      if (text.endsWith(marker.slice(0, len))) {
        return text.slice(0, text.length - len);
      }
    }
  }
  return text;
}

/** Split a block body into answer / follow-ups on the first marker occurrence. */
function sliceOn(body: string, marker: string): [string, string | null] {
  const at = body.indexOf(marker);
  if (at === -1) return [body, null];
  return [body.slice(0, at), body.slice(at + marker.length)];
}

function parseFollowUps(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s?/, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Parse raw model output (partial or complete) into questions. Tolerant by
 * design: every field is optional and whatever text has arrived is surfaced, so
 * the same function drives both live streaming and the final result.
 */
export function parseInterviewStream(raw: string): ParsedQuestion[] {
  // Everything before the first question marker is preamble/noise.
  const segments = raw.split(MARKERS.question).slice(1);
  const questions: ParsedQuestion[] = [];

  for (const segment of segments) {
    const complete = segment.includes(MARKERS.end);
    // Drop the terminator and anything after it (rare stray trailing text).
    const [beforeEnd] = sliceOn(segment, MARKERS.end);

    const [questionPart, afterAnswerMarker] = sliceOn(
      beforeEnd,
      MARKERS.answer,
    );
    let answerPart = "";
    let followUpsPart = "";
    if (afterAnswerMarker !== null) {
      const [ans, afterFollowUps] = sliceOn(
        afterAnswerMarker,
        MARKERS.followUps,
      );
      answerPart = ans;
      if (afterFollowUps !== null) followUpsPart = afterFollowUps;
    }

    const question = stripTrailingPartialMarker(questionPart).trim();
    const answer = stripTrailingPartialMarker(answerPart).trim();
    const followUps = parseFollowUps(stripTrailingPartialMarker(followUpsPart));

    // Skip blocks that haven't produced any visible content yet, so a lone
    // trailing "<<<QUESTION>>>" doesn't render an empty card.
    if (!question && !answer && followUps.length === 0) continue;

    questions.push({ question, answer, followUps, complete });
  }

  return questions;
}

/**
 * Reduce parsed blocks to the final, saveable question list: only blocks that
 * produced both a question and an answer, capped at MAX_QUESTIONS. Mirrors the
 * old JSON parser's contract so downstream consumers (cards, localStorage, eval)
 * are unchanged.
 */
export function finalizeQuestions(raw: string): InterviewQuestion[] {
  return parseInterviewStream(raw)
    .filter((q) => q.question && q.answer)
    .slice(0, MAX_QUESTIONS)
    .map(({ question, answer, followUps }) => ({
      question,
      answer,
      followUps,
    }));
}
