// Displays a single interview question, its model answer, and any follow-ups.
// Presentational — safe as a server component.

import type { InterviewQuestion } from "@/types/interview";

interface ResultCardProps {
  question: InterviewQuestion;
  index: number;
  /** True while this card's content is still streaming in; shows a caret. */
  streaming?: boolean;
}

export default function ResultCard({
  question,
  index,
  streaming = false,
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
        <span>{question.question || " "}</span>
      </h3>

      <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {question.answer}
        {streaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-zinc-400 dark:bg-zinc-500"
          />
        )}
      </div>

      {question.followUps.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Likely follow-ups
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            {question.followUps.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
