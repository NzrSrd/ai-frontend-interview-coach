"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ApiError,
  DEFAULT_LLM_SETTINGS,
  DIFFICULTY_LABELS,
  LlmSettings,
  MODEL_LABELS,
  REASONING_EFFORT_LABELS,
} from "@/types/interview";
import {
  DerivedLabels,
  EvalItemResult,
  EvalRun,
  MAX_SAVED_EVAL_ITEMS,
  SavedEvalItem,
  SavedInterview,
} from "@/types/eval";
import {
  cacheDerivedLabels,
  clearSavedInterviews,
  deleteSavedInterview,
  getSavedInterviewsServerSnapshot,
  getSavedInterviewsSnapshot,
  subscribeSavedInterviews,
} from "@/lib/savedInterviews";
import {
  addSavedRun,
  clearSavedRuns,
  deleteSavedRun,
  getSavedRunsServerSnapshot,
  getSavedRunsSnapshot,
  SavedEvalRun,
  subscribeSavedRuns,
} from "@/lib/savedRuns";
import {
  DEFAULT_STRATEGY,
  PROMPT_STRATEGIES,
  PromptStrategy,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
} from "@/lib/prompts/strategies";
import { formatMetric } from "@/lib/eval/metrics";

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

type Mode = "gold" | "saved";

export default function EvalDashboard() {
  const [mode, setMode] = useState<Mode>("gold");
  const [settings] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS);
  const [strategy, setStrategy] = useState<PromptStrategy>(DEFAULT_STRATEGY);
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
      <div
        role="tablist"
        aria-label="Evaluation source"
        className="flex w-fit gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <TabButton
          active={mode === "gold"}
          onClick={() => setMode("gold")}
          label="Gold set"
        />
        <TabButton
          active={mode === "saved"}
          onClick={() => setMode("saved")}
          label="Saved interviews"
        />
      </div>

      {mode === "saved" ? (
        <SavedEvalSection />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Generates an answer for each reference question, grades it with an
              LLM judge, and reports precision, recall, and false-positive rate.
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <span className="sr-only sm:not-sr-only">Prompt strategy</span>
                <select
                  value={strategy}
                  disabled={isRunning}
                  onChange={(e) =>
                    setStrategy(e.target.value as PromptStrategy)
                  }
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
            {REASONING_EFFORT_LABELS[settings.reasoningEffort].toLowerCase()}.
            The judge always runs deterministically.
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
              Running the gold set through generate → judge. This can take up to
              a minute…
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
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white text-black shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
          : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

// Item ids are `${interviewId}-q${index}`; the index is the trailing `-q<n>`.
const ITEM_ID_RE = /^(.+)-q(\d+)$/;

/**
 * Fold the derived reference (recoverable from the judged verdicts) back into
 * the saved dataset, grouped by interview id, so a later run can skip deriving.
 * Skips error rows and anything with no key points.
 */
function persistDerivedLabels(results: EvalItemResult[]): void {
  const byInterview: Record<string, Record<number, DerivedLabels>> = {};
  for (const item of results) {
    if (item.error) continue;
    const match = ITEM_ID_RE.exec(item.id);
    if (!match) continue;
    const [, interviewId, indexStr] = match;
    const keyPoints = item.keyPointResults.map((k) => k.point);
    if (keyPoints.length === 0) continue;
    const distractors = item.distractorResults.map((d) => d.claim);
    (byInterview[interviewId] ??= {})[Number(indexStr)] = {
      keyPoints,
      distractors,
    };
  }
  cacheDerivedLabels(byInterview);
}

/**
 * Evaluate answers from interviews the user generated and we auto-saved to
 * localStorage. Each saved question gets an independent reference derived from
 * the question (server-side), then its saved answer is judged against it —
 * reusing the same result panels as the gold-set run.
 */
function SavedEvalSection() {
  // Subscribe to the localStorage-backed store: SSR-safe (server snapshot is an
  // empty list) and auto-updates when interviews are deleted/cleared.
  const saved: SavedInterview[] = useSyncExternalStore(
    subscribeSavedInterviews,
    getSavedInterviewsSnapshot,
    getSavedInterviewsServerSnapshot,
  );
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  // Completed runs persist to localStorage so they can be compared after a
  // reload; the store drives the history table below.
  const savedRuns: SavedEvalRun[] = useSyncExternalStore(
    subscribeSavedRuns,
    getSavedRunsSnapshot,
    getSavedRunsServerSnapshot,
  );
  // Which history row is expanded to its per-question detail (null = none).
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  // Track de-selected interviews rather than selected ones, so a freshly
  // generated interview defaults to included without needing to reconcile the
  // selection every time the store changes.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const selectedInterviews = saved.filter((iv) => !excluded.has(iv.id));

  // Flatten each SELECTED interview's questions into one gradable item, capped
  // at the batch limit the route enforces. Ids stay unique across interviews,
  // and any cached labels ride along so the server can skip deriving for them.
  const allItems: SavedEvalItem[] = selectedInterviews.flatMap((iv) =>
    iv.questions.map((q, i) => ({
      id: `${iv.id}-q${i}`,
      topic: iv.topic,
      difficulty: iv.difficulty,
      question: q.question,
      answer: q.answer,
      ...(iv.labels?.[i] ? { labels: iv.labels[i] } : {}),
    })),
  );
  const items = allItems.slice(0, MAX_SAVED_EVAL_ITEMS);
  const truncated = allItems.length - items.length;
  const cachedCount = items.filter((it) => it.labels).length;
  const isRunning = status === "running";

  async function runEval() {
    if (items.length === 0) return;
    setStatus("running");
    setError("");
    try {
      const res = await fetch("/api/evaluate/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data: EvalRun | ApiError = await res.json();
      if (!res.ok) {
        setError((data as ApiError).error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      const result = data as EvalRun;
      setStatus("done");
      // Persist the run for later comparison and expand it right away.
      const saved = addSavedRun(result);
      setExpandedRunId(saved.id);
      // Cache the derived reference back into the dataset so the next run skips
      // the derive call. The labels are recoverable from the judged verdicts.
      persistDerivedLabels(result.items);
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  function handleClearAll() {
    // The store notifies subscribers, so the list updates without local state.
    clearSavedInterviews();
    setStatus("idle");
  }

  function handleClearHistory() {
    clearSavedRuns();
    setExpandedRunId(null);
  }

  function handleDeleteRun(id: string) {
    deleteSavedRun(id);
    setExpandedRunId((cur) => (cur === id ? null : cur));
  }

  function handleDelete(id: string) {
    deleteSavedInterview(id);
  }

  function toggleInterview(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected =
    saved.length > 0 && selectedInterviews.length === saved.length;

  function toggleSelectAll() {
    // If everything is selected, exclude all; otherwise clear all exclusions.
    setExcluded(allSelected ? new Set(saved.map((iv) => iv.id)) : new Set());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
          Grades the answers from interviews you generated (auto-saved in this
          browser). For each question we derive a reference from the question
          alone, then judge the saved answer against it.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runEval}
            disabled={isRunning || items.length === 0}
            className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isRunning
              ? "Evaluating…"
              : `Run eval on ${items.length} answer${items.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {truncated > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Grading the {MAX_SAVED_EVAL_ITEMS} most recent answers; {truncated}{" "}
          older {truncated === 1 ? "answer is" : "answers are"} skipped this
          run.
        </p>
      )}

      {items.length > 0 && cachedCount > 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {cachedCount} of {items.length} already labeled — those skip the
          derive call, so this run makes {items.length * 2 - cachedCount} model
          call
          {items.length * 2 - cachedCount === 1 ? "" : "s"} instead of{" "}
          {items.length * 2}.
        </p>
      )}

      {saved.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
          No saved interviews yet. Generate some questions on the home page and
          they’ll appear here automatically.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Saved interviews · {selectedInterviews.length}/{saved.length}{" "}
              selected
            </h2>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleSelectAll}
                disabled={isRunning}
                className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-black hover:underline disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                {allSelected ? "Select none" : "Select all"}
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isRunning}
                className="text-xs font-medium text-zinc-400 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50 dark:text-zinc-500 dark:hover:text-red-400"
              >
                Clear all
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {saved.map((iv) => {
              const checked = !excluded.has(iv.id);
              return (
                <li
                  key={iv.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleInterview(iv.id)}
                    disabled={isRunning}
                    aria-label={`Include ${iv.topic} ${DIFFICULTY_LABELS[iv.difficulty]} interview in the eval run`}
                    className="h-4 w-4 shrink-0 accent-foreground disabled:opacity-50"
                  />
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="font-medium text-black dark:text-zinc-50">
                      {iv.topic} · {DIFFICULTY_LABELS[iv.difficulty]}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {iv.questions.length} question
                      {iv.questions.length === 1 ? "" : "s"}
                      {iv.labels ? " · labeled" : ""} ·{" "}
                      {new Date(iv.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(iv.id)}
                    disabled={isRunning}
                    aria-label="Delete this saved interview"
                    className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          Deriving a reference and judging each saved answer. This can take up
          to a minute…
        </p>
      )}

      {savedRuns.length > 0 && (
        <RunHistoryPanel
          runs={savedRuns}
          expandedId={expandedRunId}
          onToggle={(id) => setExpandedRunId((cur) => (cur === id ? null : id))}
          onDelete={handleDeleteRun}
          onClear={handleClearHistory}
          disabled={isRunning}
        />
      )}
    </div>
  );
}

/**
 * Persistent, comparable history of saved-eval runs. Each row is a run's
 * aggregate metrics over time; clicking a row expands its full per-question
 * detail below the table. Strategy/settings are omitted as columns because they
 * are constant for saved runs (answers come from the app's main prompt).
 */
function RunHistoryPanel({
  runs,
  expandedId,
  onToggle,
  onDelete,
  onClear,
  disabled,
}: {
  runs: SavedEvalRun[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const expanded = runs.find((r) => r.id === expandedId) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Run history ({runs.length})
        </h2>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-xs font-medium text-zinc-400 underline-offset-2 hover:text-red-600 hover:underline disabled:opacity-50 dark:text-zinc-500 dark:hover:text-red-400"
        >
          Clear history
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Run</th>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Items</th>
              <th className="px-4 py-2 font-medium">Precision</th>
              <th className="px-4 py-2 font-medium">Recall</th>
              <th className="px-4 py-2 font-medium">FPR</th>
              <th className="px-4 py-2 font-medium">F1</th>
              <th className="px-4 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((saved, i) => {
              const { metrics, evaluated, total } = saved.run.aggregate;
              const isOpen = saved.id === expandedId;
              // Newest run is highest-numbered; numbering is positional.
              const number = runs.length - i;
              return (
                <tr
                  key={saved.id}
                  onClick={() => onToggle(saved.id)}
                  aria-expanded={isOpen}
                  className={`cursor-pointer border-b border-zinc-100 last:border-0 dark:border-zinc-900 ${
                    isOpen
                      ? "bg-zinc-50 dark:bg-zinc-900"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    #{number}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-zinc-500 dark:text-zinc-400">
                    {new Date(saved.savedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {evaluated}/{total}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">
                    {formatMetric(metrics.precision)}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">
                    {formatMetric(metrics.recall)}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">
                    {formatMetric(metrics.falsePositiveRate)}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums">
                    {formatMetric(metrics.f1)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(saved.id);
                      }}
                      disabled={disabled}
                      aria-label={`Delete run #${number}`}
                      className="rounded-full px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          <AggregatePanel run={expanded.run} />
          <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Per-question results
          </h3>
          {expanded.run.items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
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
