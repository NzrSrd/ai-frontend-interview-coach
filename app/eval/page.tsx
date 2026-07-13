import EvalDashboard from "@/components/EvalDashboard";

export const metadata = {
  title: "Evaluation · AI Frontend Interview Coach",
  description:
    "Precision, recall, and false-positive rate for generated answers.",
};

export default function EvalPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-10 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-4">
          <h1 className="max-w-2xl text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Answer quality evaluation
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Grade the coach&apos;s generated answers against a labeled reference
            set and track precision, recall, and false-positive rate across
            runs.
          </p>
        </header>

        <EvalDashboard />
      </main>
    </div>
  );
}
