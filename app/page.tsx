import Link from "next/link";
import InterviewForm from "@/components/InterviewForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-10 px-6 py-16 sm:px-8">
        <header className="flex flex-col gap-4">
          <h1 className="max-w-xl text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Practice for your next frontend interview.
          </h1>
          <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Pick a topic and difficulty and get AI-generated interview questions
            with model answers and likely follow-ups.
          </p>
          <Link
            href="/eval"
            className="inline-flex w-fit items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            Eval Dashboard
          </Link>
        </header>

        <InterviewForm />
      </main>
    </div>
  );
}
