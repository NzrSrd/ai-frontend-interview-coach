// Shared types for the interview coach feature.
// This is the single source of truth for both the client (form) and the
// server (API route / validation). Keep it free of any runtime/Node imports
// so it can be bundled into client components.

export const TOPICS = [
  "React",
  "Next.js",
  "TypeScript",
  "JavaScript",
  "CSS",
  "System Design",
] as const;

export type Topic = (typeof TOPICS)[number];

export const DIFFICULTIES = ["junior", "mid", "senior"] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
};

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 5;
export const DEFAULT_QUESTIONS = 3;

/** Max length of the optional free-text focus field, in characters. */
export const MAX_FOCUS_LENGTH = 200;

// --- Model selection -------------------------------------------------------
// The OpenRouter models the user may pick from. This is an allowlist: the server
// validates the requested model against it before forwarding to OpenRouter, so an
// arbitrary/expensive model string can never reach the paid API. An ops-level
// OPENROUTER_MODEL env var can still override the choice globally.

export const MODELS = [
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5",
] as const;

export type ModelId = (typeof MODELS)[number];

export const MODEL_LABELS: Record<ModelId, string> = {
  "openai/gpt-5-mini": "GPT-5 Mini",
  "openai/gpt-5-nano": "GPT-5 Nano",
  "openai/gpt-5": "GPT-5",
};

export const MODEL_DESCRIPTIONS: Record<ModelId, string> = {
  "openai/gpt-5-mini": "Recommended default — balanced quality and cost.",
  "openai/gpt-5-nano": "Cheaper and faster; good for quick drafts.",
  "openai/gpt-5": "Higher capability for the hardest question sets.",
};

export const DEFAULT_MODEL: ModelId = "openai/gpt-5-mini";

// --- LLM settings ----------------------------------------------------------
// User-tunable model parameters, exposed in the settings sidebar and forwarded
// to OpenRouter. All are clamped to these bounds server-side; never trust the
// client to stay within range.

export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 2;
export const TEMPERATURE_STEP = 0.1;
export const DEFAULT_TEMPERATURE = 0.7;

export const MAX_TOKENS_MIN = 256;
export const MAX_TOKENS_MAX = 8192;
export const MAX_TOKENS_STEP = 256;
export const DEFAULT_MAX_TOKENS = 2048;

/**
 * Reasoning effort maps to OpenRouter's unified `reasoning.effort`. "off"
 * disables reasoning entirely (nothing is sent), preserving prior behavior.
 */
export const REASONING_EFFORTS = ["off", "low", "medium", "high"] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "off";

export interface LlmSettings {
  /** OpenRouter model id; must be one of `MODELS`. */
  model: ModelId;
  /** Sampling temperature, `TEMPERATURE_MIN`–`TEMPERATURE_MAX`. */
  temperature: number;
  /** Upper bound on completion tokens, `MAX_TOKENS_MIN`–`MAX_TOKENS_MAX`. */
  maxTokens: number;
  /** Reasoning effort; "off" disables reasoning. */
  reasoningEffort: ReasoningEffort;
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  model: DEFAULT_MODEL,
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
};

/** What the client sends to `POST /api/interview`. */
export interface InterviewRequest {
  topic: Topic;
  difficulty: Difficulty;
  count: number;
  /** Optional free-text area the candidate wants to focus on. */
  focus?: string;
  /** Optional model tuning; defaults applied server-side when omitted. */
  settings?: LlmSettings;
}

export interface InterviewQuestion {
  question: string;
  /** Model answer / what a strong candidate would say. */
  answer: string;
  /** Follow-up questions an interviewer might ask. */
  followUps: string[];
}

/** Successful response body from `POST /api/interview`. */
export interface InterviewResponse {
  topic: Topic;
  difficulty: Difficulty;
  questions: InterviewQuestion[];
}

/** Error response body shape. */
export interface ApiError {
  error: string;
}