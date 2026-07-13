// Skeleton shown while the interview request is in flight. Purely
// presentational — no client hooks, safe as a server component.

export default function LoadingState() {
  return (
    <div
      className="flex flex-col gap-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Generating interview questions…</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="mb-4 h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-3 w-11/12 rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-900" />
          </div>
        </div>
      ))}
    </div>
  );
}