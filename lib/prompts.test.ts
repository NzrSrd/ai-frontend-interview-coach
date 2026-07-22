import { describe, it, expect } from "vitest";
import { buildInterviewPrompt, buildAnswerPrompt } from "@/lib/prompts";
import {
  PROMPT_STRATEGIES,
  DEFAULT_STRATEGY,
  answerSystemPrompt,
} from "@/lib/prompts/strategies";
import { MARKERS } from "@/lib/interviewFormat";

describe("buildInterviewPrompt", () => {
  it("interpolates count, topic, and difficulty label", () => {
    const p = buildInterviewPrompt({
      topic: "React",
      difficulty: "senior",
      count: 4,
    });
    expect(p).toContain("Generate 4 React interview question(s)");
    expect(p).toContain("Senior frontend candidate");
  });

  it("includes the focus as untrusted input when present", () => {
    const p = buildInterviewPrompt({
      topic: "CSS",
      difficulty: "mid",
      count: 1,
      focus: "flexbox alignment",
    });
    expect(p).toContain("untrusted candidate input");
    expect(p).toContain("flexbox alignment");
  });

  it("omits the focus line when absent", () => {
    const p = buildInterviewPrompt({
      topic: "CSS",
      difficulty: "mid",
      count: 1,
    });
    expect(p).not.toContain("untrusted candidate input");
  });

  it("adds strategy guidance only for non-zero-shot strategies", () => {
    const zero = buildInterviewPrompt({
      topic: "React",
      difficulty: "mid",
      count: 1,
      strategy: "zero-shot",
    });
    expect(zero).not.toContain("Answering technique:");

    const cot = buildInterviewPrompt({
      topic: "React",
      difficulty: "mid",
      count: 1,
      strategy: "chain-of-thought",
    });
    expect(cot).toContain("Answering technique:");
    // Guidance preserves the delimited output contract.
    expect(cot).toContain(MARKERS.answer);
  });
});

describe("buildAnswerPrompt", () => {
  it("frames topic/difficulty context when both are present", () => {
    const p = buildAnswerPrompt({
      question: "What is hoisting?",
      topic: "JavaScript",
      difficulty: "junior",
    });
    expect(p).toContain("JavaScript interview");
    expect(p).toContain("Junior");
    expect(p).toContain('"What is hoisting?"');
  });

  it("still answers the question with no context", () => {
    const p = buildAnswerPrompt({ question: "Explain closures" });
    expect(p).toContain('"Explain closures"');
    expect(p).not.toContain("follow-up question in a");
  });
});

describe("answerSystemPrompt", () => {
  it("returns a non-empty prompt for every registered strategy", () => {
    for (const s of PROMPT_STRATEGIES) {
      expect(answerSystemPrompt(s).length).toBeGreaterThan(0);
    }
  });

  it("has a resolvable default strategy", () => {
    expect(PROMPT_STRATEGIES).toContain(DEFAULT_STRATEGY);
    expect(answerSystemPrompt(DEFAULT_STRATEGY).length).toBeGreaterThan(0);
  });
});
