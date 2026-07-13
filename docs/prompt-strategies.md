# Prompt strategies: techniques compared

This app can answer a frontend interview question with any of five **prompting
techniques**, defined in [`lib/prompts/strategies.ts`](../lib/prompts/strategies.ts).
This document records how they were compared, the measured results, and which
one the app defaults to and why.

The comparison is not hand-waving: it runs each strategy through the app's own
evaluation harness — the same gold set + LLM judge that powers `/eval` — and
compares precision, recall, F1, and accuracy.

## The five strategies

| Key | Technique | Idea |
| --- | --- | --- |
| `zero-shot` | Zero-shot | One direct instruction. No examples, no reasoning scaffold. The baseline. |
| `persona` | Role / persona | Prime an expert identity ("principal frontend engineer") and a demanding audience before answering. |
| `chain-of-thought` | Chain-of-thought | Instruct the model to reason through the mechanism step by step, then let that reasoning shape the explanation. |
| `few-shot` | Few-shot | Two worked Q→A exemplars (on topics *disjoint* from the gold set) set the bar for depth and precision. |
| `self-critique` | Self-critique (reflexion) | Draft, then silently audit the draft for overclaims/misconceptions, and emit only the corrected answer. |

All five share the same output contract (a few short prose paragraphs, no
markdown) so the judge grades **content, not format**, and the comparison stays
fair.

## Methodology

- **System under test:** the answer the model generates for each of the 7 gold
  questions in [`lib/eval/goldset.ts`](../lib/eval/goldset.ts).
- **Judge:** `gpt-5-mini` at temperature 0 (held constant across every run), grading
  each answer against hand-labeled `keyPoints` (facts a correct answer should
  contain → positives) and `distractors` (plausible-but-wrong claims it should
  avoid → negatives).
- **Metrics:** micro-averaged over the gold set. `TP` = key points covered,
  `FN` = key points missed, `FP` = distractors asserted, `TN` = distractors
  avoided. `unsup` counts wrong claims the answer made that aren't in the
  distractor list (surfaced for insight, excluded from the matrix).
- **Controls:** temperature 0 and `maxTokens` 8192 held constant, so any
  difference is attributable to the prompt, not sampling or truncation. Each
  cell is a clean 7/7 run (items that hit a sporadic empty completion were
  re-run — those are transport noise, not strategy quality).
- **Two capability tiers:** the strong default model (`gpt-5-mini`) and the
  cheap model (`gpt-5-nano`), because the "best" prompt turns out to depend on
  model capability.

Reproduce with the eval dashboard (pick a strategy, Run evaluation) or by
POSTing `{ "strategy": "...", "settings": {...} }` to `/api/evaluate`.

## Results

### gpt-5-mini (the capable, default model)

| Strategy | Precision | Recall | FPR | F1 | Accuracy | Unsup | TP/FN/FP/TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| zero-shot | 100% | 100% | 0% | **100%** | 100% | 0 | 27/0/0/21 |
| persona | 100% | 100% | 0% | **100%** | 100% | 0 | 27/0/0/21 |
| chain-of-thought | 100% | 100% | 0% | **100%** | 100% | 1 | 27/0/0/21 |
| few-shot | 100% | 100% | 0% | **100%** | 100% | 0 | 27/0/0/21 |
| self-critique | 100% | 100% | 0% | **100%** | 100% | 1 | 27/0/0/21 |

The gold set is **saturated** on this model — every strategy is perfect. The
metric can't separate them. The only differences are secondary:

- **Latency (whole 7-item run):** zero-shot ~56s < few-shot ~64s < self-critique
  ~68s < chain-of-thought ~74s < persona ~96s.
- **Unsupported claims:** chain-of-thought and self-critique each introduced 1
  (their extra "thinking" occasionally adds a stray claim); the rest added none.

### gpt-5-nano (the cheap model — where differences surface)

| Strategy | Precision | Recall | FPR | F1 | Accuracy | Unsup | TP/FN/FP/TN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| self-critique | 100% | **100%** | 0% | **100%** | 100% | 0 | 27/0/0/21 |
| zero-shot | 100% | 96.3% | 0% | 98.1% | 97.9% | 0 | 26/1/0/21 |
| chain-of-thought | 100% | 96.3% | 0% | 98.1% | 97.9% | 2 | 26/1/0/21 |
| few-shot | 100% | 96.3% | 0% | 98.1% | 97.9% | 0 | 26/1/0/21 |
| persona | 100% | 92.6% | 0% | 96.2% | 95.8% | 1 | 25/2/0/21 |

Two robust observations:

1. **Precision and FPR are perfect everywhere.** No strategy, on either model,
   asserted a distractor. The distractors in this gold set are easy to avoid, so
   all separation is in **recall** (did the answer cover the key points?) plus
   the secondary unsupported-claims signal.
2. **On a weak model, self-critique wins.** It's the only strategy that recovers
   full recall (27/27) *and* adds no unsupported claims — the draft-then-audit
   pass pays off precisely when the base model is more error-prone. `persona`
   was weakest (lowest recall), and `chain-of-thought` matched the baseline on
   recall but added the most unsupported claims (2).

## Decision

**The app defaults to `zero-shot`** ([`DEFAULT_STRATEGY`](../lib/prompts/strategies.ts)).

Rationale: the default model is `gpt-5-mini`, where every technique ties at a
perfect score. When quality is equal, the tiebreakers are cost and latency, and
zero-shot is the cheapest and fastest with zero unsupported claims. The elaborate
techniques add tokens and latency (persona ~1.7× the wall-clock) for no
measurable quality gain, and two of them even introduce the occasional
unsupported claim.

The corollary — worth keeping in mind if the default model ever changes to
something cheaper — is that **self-critique is the strategy to reach for on a
weaker model**, where its self-audit step is the only thing that closes the
recall gap.

## Caveats

- **Small gold set:** 7 questions, 27 key points, 21 distractors. The nano recall
  gaps are 1–2 key points — suggestive, near the noise floor, not definitive.
- **Reasoning nondeterminism:** even at temperature 0, GPT-5 reasoning tokens
  vary slightly run-to-run, so treat ±1 key point as noise.
- **Judge is `gpt-5-mini`:** a capable judge grading (sometimes weaker) generated
  answers. A different judge could shift borderline calls.
- **To strengthen this:** grow the gold set (especially harder, senior-level
  items and trickier distractors that actually catch models out), and average
  several runs per cell instead of one clean run.
