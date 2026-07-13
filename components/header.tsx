import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="flex h-16 w-full items-center justify-center border-b border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400 gap-4">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <Link href="/" aria-label="Home">
          <Image
            className="dark:invert"
            src="/next.svg"
            alt="Next.js logo"
            width={100}
            height={20}
            priority
          />
        </Link>
        <Link
          href="/eval"
          className="inline-flex w-fit items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
        >
          Eval Dashboard
        </Link>
      </div>
    </header>
  );
}
