// Shown after the request is sent but before the first streamed token arrives.
// Once text starts streaming, the live result cards replace this. Purely
// presentational — no client hooks, safe as a server component.

export default function LoadingState() {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="flex gap-1" aria-hidden>
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s] dark:bg-zinc-500" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s] dark:bg-zinc-500" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" />
      </span>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Generating your interview…
      </span>
    </div>
  );
}
