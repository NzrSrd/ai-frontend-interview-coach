"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  DEFAULT_LLM_SETTINGS,
  DIFFICULTY_LABELS,
  LlmSettings,
  MODEL_LABELS,
  REASONING_EFFORT_LABELS,
} from "@/types/interview";
import { EvalItemResult, EvalRun } from "@/types/eval";
import {
  DEFAULT_STRATEGY,
  PROMPT_STRATEGIES,
  PromptStrategy,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
} from "@/lib/prompts/strategies";
import { formatMetric } from "@/lib/eval/metrics";
import SettingsSidebar from "@/components/SettingsSidebar";

/** One completed run, kept in session state so metrics can be tracked over time. */
interface SessionRun {
  index: number;
  at: number;
  run: EvalRun;
}

/**
 * Plain-language definitions for each aggregate metric, grounded in how this
 * harness grades: key points the answer should cover vs. distractors (known
 * wrong claims) it should avoid.
 */
const METRIC_INFO: Record<string, string> = {
  Precision:
    "Of all the factual claims in the answer, the share that were correct key points rather than wrong “distractor” claims. Higher means fewer incorrect statements slip in.",
  Recall:
    "Of all the key points a good answer should mention, the share this answer actually covered. Higher means a more complete answer.",
  "False positive rate":
    "Of all the known wrong claims (distractors) the answer could have made, the share it actually asserted. Lower is better.",
  F1: "The harmonic mean of precision and recall — a single balanced score that is high only when the answer is both correct and complete.",
};

export default function EvalDashboard() {
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [strategy, setStrategy] = useState<PromptStrategy>(DEFAULT_STRATEGY);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [history, setHistory] = useState<SessionRun[]>([]);

  const latest = history[0]?.run ?? null;
  const isRunning = status === "running";

  async function runEvaluation() {
    setStatus("running");
    setError("");
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, strategy }),
      });
      const data: EvalRun | ApiError = await res.json();

      if (!res.ok) {
        setError((data as ApiError).error ?? "Something went wrong.");
        setStatus("error");
        return;
      }

      setHistory((prev) => [
        { index: prev.length + 1, at: Date.now(), run: data as EvalRun },
        ...prev,
      ]);
      setStatus("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Generates an answer for each reference question, grades it with an LLM
          judge, and reports precision, recall, and false-positive rate.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span className="sr-only sm:not-sr-only">Prompt strategy</span>
            <select
              value={strategy}
              disabled={isRunning}
              onChange={(e) => setStrategy(e.target.value as PromptStrategy)}
              title={STRATEGY_DESCRIPTIONS[strategy]}
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 outline-none transition-colors hover:border-zinc-300 focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700"
            >
              {PROMPT_STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:text-black dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-zinc-50"
          >
            Model settings
          </button>
          <button
            type="button"
            onClick={runEvaluation}
            disabled={isRunning}
            className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isRunning ? "Evaluating…" : "Run evaluation"}
          </button>
        </div>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Answers generated with {MODEL_LABELS[settings.model]} using the{" "}
        {STRATEGY_LABELS[strategy].toLowerCase()} prompt at temperature{" "}
        {settings.temperature.toFixed(1)}, max {settings.maxTokens} tokens,
        reasoning{" "}
        {REASONING_EFFORT_LABELS[settings.reasoningEffort].toLowerCase()}. The
        judge always runs deterministically.
      </p>

      {status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {isRunning && (
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          Running the gold set through generate → judge. This can take up to a
          minute…
        </p>
      )}

      {latest && (
        <>
          <AggregatePanel run={latest} />
          {history.length > 1 && <HistoryPanel history={history} />}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Per-question results
            </h2>
            {latest.items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </section>
        </>
      )}

      <SettingsSidebar
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        disabled={isRunning}
      />
    </div>
  );
}

function AggregatePanel({ run }: { run: EvalRun }) {
  const { metrics, matrix, evaluated, total } = run.aggregate;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">
          Aggregate metrics
        </h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {evaluated}/{total} items evaluated
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Precision"
          value={formatMetric(metrics.precision)}
          info={METRIC_INFO["Precision"]}
        />
        <MetricCard
          label="Recall"
          value={formatMetric(metrics.recall)}
          info={METRIC_INFO["Recall"]}
        />
        <MetricCard
          label="False positive rate"
          value={formatMetric(metrics.falsePositiveRate)}
          info={METRIC_INFO["False positive rate"]}
        />
        <MetricCard
          label="F1"
          value={formatMetric(metrics.f1)}
          info={METRIC_INFO["F1"]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountCard label="True positives" value={matrix.truePositives} />
        <CountCard label="False negatives" value={matrix.falseNegatives} />
        <CountCard label="False positives" value={matrix.falsePositives} />
        <CountCard label="True negatives" value={matrix.trueNegatives} />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Dismiss the popover on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <span className="flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
        {info && (
          <span ref={anchorRef} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={`What is ${label}?`}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold leading-none text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
            >
              i
            </button>
            {open && (
              <span
                role="tooltip"
                className="absolute left-1/2 top-6 z-20 w-52 -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 text-xs font-normal leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {info}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="font-mono text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">
        {value}
      </span>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-mono text-sm font-medium tabular-nums text-black dark:text-zinc-50">
        {value}
      </span>
    </div>
  );
}

function HistoryPanel({ history }: { history: SessionRun[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Session history ({history.length} runs)
      </h2>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Run</th>
              <th className="px-4 py-2 font-medium">Strategy</th>
              <th className="px-4 py-2 font-medium">Precision</th>
              <th className="px-4 py-2 font-medium">Recall</th>
              <th className="px-4 py-2 font-medium">FPR</th>
              <th className="px-4 py-2 font-medium">F1</th>
              <th className="px-4 py-2 font-medium">Temp</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {history.map(({ index, run }) => (
              <tr
                key={index}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
              >
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                  #{index}
                </td>
                <td className="px-4 py-2 font-sans text-zinc-500 dark:text-zinc-400">
                  {STRATEGY_LABELS[run.strategy]}
                </td>
                <td className="px-4 py-2">
                  {formatMetric(run.aggregate.metrics.precision)}
                </td>
                <td className="px-4 py-2">
                  {formatMetric(run.aggregate.metrics.recall)}
                </td>
                <td className="px-4 py-2">
                  {formatMetric(run.aggregate.metrics.falsePositiveRate)}
                </td>
                <td className="px-4 py-2">
                  {formatMetric(run.aggregate.metrics.f1)}
                </td>
                <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                  {run.settings.temperature.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ItemRow({ item }: { item: EvalItemResult }) {
  const { matrix } = item;
  return (
    <details className="group rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            {item.question}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {item.topic} · {DIFFICULTY_LABELS[item.difficulty]}
          </span>
        </span>
        {item.error ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            error
          </span>
        ) : (
          <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            TP {matrix.truePositives} · FN {matrix.falseNegatives} · FP{" "}
            {matrix.falsePositives} · TN {matrix.trueNegatives}
          </span>
        )}
      </summary>

      {item.error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {item.error}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4 text-sm">
          <VerdictList
            title="Key points"
            items={item.keyPointResults.map((k) => ({
              text: k.point,
              good: k.covered,
              goodLabel: "covered",
              badLabel: "missed",
            }))}
          />
          <VerdictList
            title="Distractors"
            items={item.distractorResults.map((d) => ({
              // For distractors, NOT asserting is the good outcome.
              text: d.claim,
              good: !d.asserted,
              goodLabel: "avoided",
              badLabel: "asserted",
            }))}
          />
          {item.unsupportedClaims.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Unsupported claims (not in matrix)
              </span>
              <ul className="list-inside list-disc text-zinc-600 dark:text-zinc-400">
                {item.unsupportedClaims.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Generated answer
            </span>
            <p className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
              {item.generatedAnswer}
            </p>
          </div>
        </div>
      )}
    </details>
  );
}

function VerdictList({
  title,
  items,
}: {
  title: string;
  items: Array<{
    text: string;
    good: boolean;
    goodLabel: string;
    badLabel: string;
  }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {title}
      </span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={`mt-0.5 shrink-0 font-mono text-xs ${
                item.good
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {item.good ? "✓" : "✗"}
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {item.text}{" "}
              <span
                className={
                  item.good
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                ({item.good ? item.goodLabel : item.badLabel})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
