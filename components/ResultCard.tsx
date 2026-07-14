"use client";

// Displays a single interview question, its model answer, and follow-ups. Each
// follow-up is clickable: it expands to a model answer streamed from
// `/api/answer`, using the same prompting technique and model settings as the
// interview.

import { useEffect, useRef, useState } from "react";
import type {
  AnswerRequest,
  ApiError,
  Difficulty,
  InterviewQuestion,
  LlmSettings,
  Topic,
} from "@/types/interview";
import type { PromptStrategy } from "@/lib/prompts/strategies";

/** Context needed to request an answer for a follow-up question. */
export interface AnswerContext {
  topic?: Topic;
  difficulty?: Difficulty;
  settings: LlmSettings;
  strategy: PromptStrategy;
}

interface ResultCardProps {
  question: InterviewQuestion;
  index: number;
  /** True while this card's content is still streaming in; shows a caret and
   *  keeps follow-ups non-interactive until the block is complete. */
  streaming?: boolean;
  /** Model/prompt context for answering follow-ups; omit to disable them. */
  context?: AnswerContext;
}

/** Blinking caret shown at the end of text that is still streaming. */
function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-zinc-400 dark:bg-zinc-500"
    />
  );
}

export default function ResultCard({
  question,
  index,
  streaming = false,
  context,
}: ResultCardProps) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="flex gap-3 text-lg font-semibold leading-7 text-black dark:text-zinc-50">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-sm text-background"
        >
          {index + 1}
        </span>
        <span>{question.question || " "}</span>
      </h3>

      <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {question.answer}
        {streaming && <Caret />}
      </div>

      {question.followUps.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Likely follow-ups
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Click a question to reveal a model answer.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {question.followUps.map((f, i) => (
              <FollowUp
                key={i}
                question={f}
                context={context}
                // A still-streaming block may hold a half-written follow-up;
                // wait until it's complete before allowing a request.
                disabled={streaming || !context}
              />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

type FollowUpStatus = "idle" | "streaming" | "done" | "error";

function FollowUp({
  question,
  context,
  disabled,
}: {
  question: string;
  context?: AnswerContext;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FollowUpStatus>("idle");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Abort an in-flight answer stream if the card unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function fetchAnswer() {
    if (!context) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("streaming");
    setError("");
    setAnswer("");

    const payload: AnswerRequest = {
      question,
      topic: context.topic,
      difficulty: context.difficulty,
      settings: context.settings,
      strategy: context.strategy,
    };

    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data: ApiError | null = await res.json().catch(() => null);
        setError(data?.error ?? "Could not fetch an answer.");
        setStatus("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setAnswer(raw);
      }
      raw += decoder.decode();
      setAnswer(raw);
      setStatus(raw.trim() ? "done" : "error");
      if (!raw.trim()) {
        setError("The model didn't return an answer. Try again.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  function handleClick() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Fetch on first open or when retrying after an error.
    if (status === "idle" || status === "error") fetchAnswer();
  }

  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-expanded={open}
        className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-black disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`mt-1 shrink-0 text-zinc-400 transition-transform group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${
            open ? "rotate-90" : ""
          }`}
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="flex-1">{question}</span>
      </button>

      {open && (
        <div className="ml-6 mt-1 border-l border-zinc-100 pl-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {status === "error" ? (
            <p role="alert" className="text-red-600 dark:text-red-400">
              {error}{" "}
              <button
                type="button"
                onClick={fetchAnswer}
                className="font-medium underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
              >
                Retry
              </button>
            </p>
          ) : status === "streaming" && !answer ? (
            <p className="text-zinc-400 dark:text-zinc-500">Thinking…</p>
          ) : (
            <p className="whitespace-pre-wrap">
              {answer}
              {status === "streaming" && <Caret />}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
