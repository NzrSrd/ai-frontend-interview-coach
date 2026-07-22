import InterviewForm from "@/components/InterviewForm";
import PageIntro from "@/components/PageIntro";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-4xl flex-col gap-6 p-6 sm:px-8">
        <PageIntro
          title="Practice for your next frontend interview."
          description="Pick a topic and difficulty and get AI-generated interview questions with model answers and likely follow-ups."
        />

        <InterviewForm />
      </main>
    </div>
  );
}
