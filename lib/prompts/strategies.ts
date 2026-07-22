// Answer-generation prompt STRATEGIES for the eval harness.
//
// The eval harness (lib/eval/runner.ts) treats the model's answer to a fixed
// gold question as the system under test, then grades it against hand-labeled
// key points (facts it should contain) and distractors (wrong claims it must
// avoid). That makes it a real measurement instrument for comparing prompting
// techniques: swap the system prompt, re-run the gold set, compare precision /
// recall / F1.
//
// Each strategy below is the SAME task ("answer this frontend interview
// question well") expressed with a different, well-known prompting technique.
// They deliberately share the output contract — a short prose answer, no
// markdown — so the judge grades content, not format, and the comparison stays
// fair. This module is pure strings + types, safe to import on client (labels)
// and server (bodies).

export const PROMPT_STRATEGIES = [
  "zero-shot",
  // "persona",
  "chain-of-thought",
  "few-shot",
  // "self-critique",
] as const;

export type PromptStrategy = (typeof PROMPT_STRATEGIES)[number];

export const STRATEGY_LABELS: Record<PromptStrategy, string> = {
  "zero-shot": "Zero-shot",
  // "persona": "Role / persona",
  "chain-of-thought": "Chain-of-thought",
  "few-shot": "Few-shot",
  // "self-critique": "Self-critique",
};

export const STRATEGY_DESCRIPTIONS: Record<PromptStrategy, string> = {
  "zero-shot": "Plain direct instruction — no examples, no reasoning scaffold.",
  // "persona": "Establishes an expert role and audience before answering.",
  "chain-of-thought": "Reason through the mechanism step by step, then answer.",
  "few-shot": "Two worked examples set the bar for depth and precision.",
  // "self-critique":
  //   "Draft, self-review for errors, then output the vetted answer.",
};

// The shared output contract appended to every strategy so grading is fair.
const OUTPUT_CONTRACT =
  "Write a few short paragraphs (no headings, no markdown, no code fences). " +
  "State only claims you are confident are correct; do not pad the answer with " +
  "unrelated facts.";

// --- 1. Zero-shot ----------------------------------------------------------
// The baseline: a single direct instruction, no exemplars, no reasoning steps.
const ZERO_SHOT = `You are answering a technical frontend interview question. \
Answer it accurately and concisely. ${OUTPUT_CONTRACT}`;

// --- 2. Role / persona -----------------------------------------------------
// Same task, but we prime an expert identity and a demanding audience. Persona
// framing tends to lift domain precision and tone at little cost.
// Exported (not registered) so it survives lint while disabled in the UI.
export const PERSONA = `You are a principal frontend engineer with 15 years of \
production experience, known for explaining hard concepts precisely to a senior \
hiring panel. A candidate has been asked the question below; give the model \
answer you would want to hear. Be rigorous — the panel will catch any \
hand-waving or subtly wrong claim. ${OUTPUT_CONTRACT}`;

// --- 3. Chain-of-thought ---------------------------------------------------
// Elicit explicit step-by-step reasoning about the underlying mechanism before
// committing to the explanation. Because a good "explain how X works" answer IS
// a walk through the mechanism, the reasoning becomes the answer.
const CHAIN_OF_THOUGHT = `You are answering a technical frontend interview \
question. Think it through step by step before writing: first identify the core \
mechanism the question is really about, then reason through what happens in \
order, then recall the common misconception people get wrong here. Let that \
reasoning shape a clear, correct explanation that walks through the mechanism \
in order. ${OUTPUT_CONTRACT}`;

// --- 4. Few-shot -----------------------------------------------------------
// Two worked exemplars demonstrate the target depth, accuracy, and precision.
// The exemplar questions are deliberately DISJOINT from the gold set (closures,
// box-sizing) so no gold answer leaks into the prompt.
const FEW_SHOT = `You are answering technical frontend interview questions. \
Match the depth, precision, and tone of the worked examples below, then answer \
the new question the same way. ${OUTPUT_CONTRACT}

Example 1
Q: What is a closure in JavaScript?
A: A closure is the combination of a function and the lexical environment it was \
defined in. When a function is created it keeps a reference to the variables in \
the scope where it was declared, so it can still read and update them after that \
outer scope has returned. This is what lets a factory function return an inner \
function that "remembers" its arguments, and it underlies patterns like data \
privacy via module scope. The captured variables are held by reference, not \
copied, which is why closures created in a loop can share the same variable if \
it isn't scoped per iteration.

Example 2
Q: What does box-sizing: border-box do?
A: box-sizing: border-box changes how an element's width and height are \
calculated so that padding and border are included inside the specified size \
rather than added on top of it. With the default content-box, setting width: \
200px plus padding and a border makes the rendered box wider than 200px; with \
border-box the element stays 200px and the content area shrinks to accommodate \
the padding and border. This makes layouts far more predictable, which is why \
many stylesheets set it globally on all elements.`;

// --- 5. Self-critique (reflexion) ------------------------------------------
// Ask the model to draft, then audit its own draft for overclaims and common
// misconceptions, and emit only the corrected answer. Targets precision —
// fewer asserted distractors — at some latency cost.
// Exported (not registered) so it survives lint while disabled in the UI.
export const SELF_CRITIQUE = `You are answering a technical frontend interview \
question. Work in two silent passes and show only the result of the second. \
First, draft an answer. Second, critically review your draft: check every claim \
for technical accuracy, delete anything you are not confident is correct, and \
fix any statement that matches a common misconception about this topic. Then \
output only the final, corrected answer — do not show the draft or the review. \
${OUTPUT_CONTRACT}`;

const PROMPTS: Record<PromptStrategy, string> = {
  "zero-shot": ZERO_SHOT,
  // "persona": PERSONA,
  "chain-of-thought": CHAIN_OF_THOUGHT,
  "few-shot": FEW_SHOT,
  // "self-critique": SELF_CRITIQUE,
};

/**
 * The default answer strategy. Chosen from the empirical comparison in
 * docs/prompt-strategies.md: on a capable model every strategy tied on
 * precision/recall/F1, so we default to the cheapest and fastest one that
 * carries no quality penalty — plain zero-shot. Re-run the eval before changing.
 */
export const DEFAULT_STRATEGY: PromptStrategy = "zero-shot";

/** Return the system prompt for a given strategy. */
export function answerSystemPrompt(strategy: PromptStrategy): string {
  return PROMPTS[strategy];
}
