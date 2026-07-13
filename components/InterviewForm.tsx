"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  DEFAULT_LLM_SETTINGS,
  DEFAULT_QUESTIONS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  Difficulty,
  InterviewRequest,
  InterviewResponse,
  LlmSettings,
  MAX_FOCUS_LENGTH,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  Topic,
  TOPICS,
} from "@/types/interview";
import LoadingState from "@/components/LoadingState";
import ResultCard from "@/components/ResultCard";
import SettingsSidebar from "@/components/SettingsSidebar";
import { saveInterview } from "@/lib/savedInterviews";
import { finalizeQuestions, parseInterviewStream } from "@/lib/interviewFormat";

type Status = "idle" | "loading" | "streaming" | "done" | "error";

export default function InterviewForm() {
  const [topic, setTopic] = useState<Topic>(TOPICS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [count, setCount] = useState<number>(DEFAULT_QUESTIONS);
  const [focus, setFocus] = useState<string>("");
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  // Raw accumulated stream text; parsed into cards on every chunk.
  const [streamText, setStreamText] = useState<string>("");
  // Topic/difficulty captured at submit time so the results header is stable
  // even if the form controls change while a generation is in flight.
  const [meta, setMeta] = useState<{
    topic: Topic;
    difficulty: Difficulty;
  } | null>(null);
  const [error, setError] = useState<string>("");

  // Abort any in-flight generation on a new submit or unmount.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const parsed = useMemo(() => parseInterviewStream(streamText), [streamText]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");
    setError("");
    setStreamText("");
    setMeta({ topic, difficulty });

    const payload: InterviewRequest = {
      topic,
      difficulty,
      count,
      focus: focus.trim() || undefined,
      settings,
    };

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Connection-time failures still return a JSON error body.
        const data: ApiError | null = await res.json().catch(() => null);
        setError(data?.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      if (!res.body) {
        setError("The server sent no response body.");
        setStatus("error");
        return;
      }

      // Read the streamed text and re-render cards as each chunk arrives.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      setStatus("streaming");
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        setStreamText(raw);
      }
      raw += decoder.decode(); // flush any trailing bytes
      setStreamText(raw);

      // Finalize: a truncated stream just yields fewer complete questions rather
      // than failing. Only a genuinely empty result is treated as an error.
      const questions = finalizeQuestions(raw);
      if (questions.length === 0) {
        setError(
          "The model ran out of tokens before it could answer. Increase Max tokens and try again.",
        );
        setStatus("error");
        return;
      }

      setStatus("done");
      // Auto-save every generation so its answers can be graded later on the
      // eval page. Best-effort and client-only — never block the UI on it.
      const interview: InterviewResponse = { topic, difficulty, questions };
      saveInterview(interview, settings);
    } catch (err) {
      // A deliberate abort (new submit / unmount) is not an error.
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  // Controls stay disabled while a generation is connecting or streaming.
  const busy = status === "loading" || status === "streaming";
  // Show the pre-token indicator until the first question block starts forming.
  const showWaiting =
    status === "loading" || (status === "streaming" && parsed.length === 0);
  const showResults =
    (status === "streaming" || status === "done") && parsed.length > 0;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-zinc-50"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8 10a2 2 0 100-4 2 2 0 000 4z"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M13 8a5 5 0 00-.09-.94l1.3-1-1.3-2.25-1.53.62a5 5 0 00-1.62-.94L9.5 1h-3l-.26 1.55a5 5 0 00-1.62.94l-1.53-.62-1.3 2.25 1.3 1A5 5 0 003 8c0 .32.03.63.09.94l-1.3 1 1.3 2.25 1.53-.62c.48.4 1.03.72 1.62.94L6.5 15h3l.26-1.55a5 5 0 001.62-.94l1.53.62 1.3-2.25-1.3-1c.06-.31.09-.62.09-.94z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
          Model settings
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Topic
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value as Topic)}
              disabled={busy}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
            >
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Difficulty
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              disabled={busy}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Number of questions: {count}
          <input
            type="range"
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
            className="accent-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Focus area{" "}
          <span className="font-normal text-zinc-500">(optional)</span>
          <input
            type="text"
            value={focus}
            maxLength={MAX_FOCUS_LENGTH}
            onChange={(e) => setFocus(e.target.value)}
            disabled={busy}
            placeholder="e.g. hooks, rendering performance, accessibility"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate questions"}
        </button>
      </form>

      {status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {showWaiting && <LoadingState />}

      {showResults && meta && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {parsed.length} {meta.topic} question
            {parsed.length === 1 ? "" : "s"} ·{" "}
            {DIFFICULTY_LABELS[meta.difficulty]}
            {status === "streaming" ? " · generating…" : ""}
          </h2>
          {parsed.map((q, i) => (
            <ResultCard
              key={i}
              question={q}
              index={i}
              // Caret only on the last, still-growing card while streaming.
              streaming={status === "streaming" && i === parsed.length - 1}
            />
          ))}
        </section>
      )}

      <SettingsSidebar
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        disabled={busy}
      />
    </div>
  );
}
