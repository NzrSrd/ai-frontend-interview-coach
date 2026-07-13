"use client";

import { useState } from "react";
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

export default function InterviewForm() {
  const [topic, setTopic] = useState<Topic>(TOPICS[0]);
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [count, setCount] = useState<number>(DEFAULT_QUESTIONS);
  const [focus, setFocus] = useState<string>("");
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [result, setResult] = useState<InterviewResponse | null>(null);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    setResult(null);

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
      });

      const data: InterviewResponse | ApiError = await res.json();

      if (!res.ok) {
        setError((data as ApiError).error ?? "Something went wrong.");
        setStatus("error");
        return;
      }

      setResult(data as InterviewResponse);
      setStatus("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  const isLoading = status === "loading";

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
              disabled={isLoading}
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
              disabled={isLoading}
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
            disabled={isLoading}
            className="accent-foreground disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Focus area <span className="font-normal text-zinc-500">(optional)</span>
          <input
            type="text"
            value={focus}
            maxLength={MAX_FOCUS_LENGTH}
            onChange={(e) => setFocus(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. hooks, rendering performance, accessibility"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-1 flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? "Generating…" : "Generate questions"}
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

      {isLoading && <LoadingState />}

      {status === "done" && result && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {result.questions.length} {result.topic} question
            {result.questions.length === 1 ? "" : "s"} ·{" "}
            {DIFFICULTY_LABELS[result.difficulty]}
          </h2>
          {result.questions.map((q, i) => (
            <ResultCard key={i} question={q} index={i} />
          ))}
        </section>
      )}

      <SettingsSidebar
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        disabled={isLoading}
      />
    </div>
  );
}