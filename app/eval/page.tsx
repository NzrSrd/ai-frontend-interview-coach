import EvalDashboard from "@/components/EvalDashboard";
import PageIntro from "@/components/PageIntro";

export const metadata = {
  title: "Evaluation · AI Frontend Interview Coach",
  description:
    "Precision, recall, and false-positive rate for generated answers.",
};

export default function EvalPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 p-6 sm:px-8">
        <PageIntro
          title="Answer quality evaluation"
          description="Grade the coach's generated answers against a labeled reference set and track precision, recall, and false-positive rate across runs."
        />

        <EvalDashboard />
      </main>
    </div>
  );
}
