import { describe, it, expect } from "vitest";
import {
  MARKERS,
  parseInterviewStream,
  finalizeQuestions,
} from "@/lib/interviewFormat";
import { MAX_QUESTIONS } from "@/types/interview";

/** Build a complete delimited block for one question. */
function block(question: string, answer: string, followUps: string[]): string {
  const fu = followUps.map((f) => `- ${f}`).join("\n");
  return [
    MARKERS.question,
    question,
    MARKERS.answer,
    answer,
    MARKERS.followUps,
    fu,
    MARKERS.end,
  ].join("\n");
}

describe("parseInterviewStream", () => {
  it("parses a single complete block", () => {
    const raw = block("What is a closure?", "A function plus its scope.", [
      "How is it used?",
      "Memory implications?",
    ]);
    const parsed = parseInterviewStream(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      question: "What is a closure?",
      answer: "A function plus its scope.",
      followUps: ["How is it used?", "Memory implications?"],
      complete: true,
    });
  });

  it("parses multiple blocks", () => {
    const raw = [block("Q1", "A1", ["f1"]), block("Q2", "A2", ["f2"])].join(
      "\n",
    );
    const parsed = parseInterviewStream(raw);
    expect(parsed.map((q) => q.question)).toEqual(["Q1", "Q2"]);
    expect(parsed.every((q) => q.complete)).toBe(true);
  });

  it("ignores preamble before the first question marker", () => {
    const raw = "Here are your questions:\n" + block("Q", "A", []);
    const parsed = parseInterviewStream(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].question).toBe("Q");
  });

  it("marks a block without <<<END>>> as incomplete", () => {
    const raw = `${MARKERS.question}\nQ\n${MARKERS.answer}\nPartial ans`;
    const parsed = parseInterviewStream(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].complete).toBe(false);
    expect(parsed[0].answer).toBe("Partial ans");
  });

  it("strips a dangling partial marker so it doesn't flicker into content", () => {
    // Stream has delivered the answer plus the start of the followups marker.
    const raw = `${MARKERS.question}\nQ\n${MARKERS.answer}\nThe answer.\n<<<FOLLOW`;
    const parsed = parseInterviewStream(raw);
    expect(parsed[0].answer).toBe("The answer.");
  });

  it("skips blocks that have produced no visible content yet", () => {
    // A lone trailing question marker should not yield an empty card.
    const raw = `${MARKERS.question}\nQ1\n${MARKERS.answer}\nA1\n${MARKERS.end}\n${MARKERS.question}`;
    const parsed = parseInterviewStream(raw);
    expect(parsed).toHaveLength(1);
  });

  it("strips leading bullet markers from follow-ups and drops blanks", () => {
    const raw = `${MARKERS.question}\nQ\n${MARKERS.answer}\nA\n${MARKERS.followUps}\n- one\n* two\n\n   \n- three\n${MARKERS.end}`;
    const parsed = parseInterviewStream(raw);
    expect(parsed[0].followUps).toEqual(["one", "two", "three"]);
  });

  it("returns an empty array for empty or marker-less input", () => {
    expect(parseInterviewStream("")).toEqual([]);
    expect(parseInterviewStream("just some prose, no markers")).toEqual([]);
  });
});

describe("finalizeQuestions", () => {
  it("keeps only blocks with both a question and an answer", () => {
    const raw = [
      block("Q1", "A1", ["f1"]),
      `${MARKERS.question}\nQ2 no answer\n${MARKERS.end}`, // no answer -> dropped
    ].join("\n");
    const final = finalizeQuestions(raw);
    expect(final).toHaveLength(1);
    expect(final[0].question).toBe("Q1");
  });

  it("drops the `complete` flag from the finalized shape", () => {
    const final = finalizeQuestions(block("Q", "A", ["f"]));
    expect(final[0]).toEqual({
      question: "Q",
      answer: "A",
      followUps: ["f"],
    });
    expect("complete" in final[0]).toBe(false);
  });

  it("caps the result at MAX_QUESTIONS", () => {
    const raw = Array.from({ length: MAX_QUESTIONS + 3 }, (_, i) =>
      block(`Q${i}`, `A${i}`, []),
    ).join("\n");
    const final = finalizeQuestions(raw);
    expect(final).toHaveLength(MAX_QUESTIONS);
  });

  it("keeps an incomplete-but-answered final block (truncated mid-answer)", () => {
    const raw = `${MARKERS.question}\nQ\n${MARKERS.answer}\nTruncated but present`;
    const final = finalizeQuestions(raw);
    expect(final).toHaveLength(1);
    expect(final[0].answer).toBe("Truncated but present");
  });
});
