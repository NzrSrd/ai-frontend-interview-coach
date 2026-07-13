import Image from "next/image";

export default function Header() {
  return (
    <header className="flex h-16 w-full items-center justify-center border-b border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400">
      <Image
        className="dark:invert"
        src="/next.svg"
        alt="Next.js logo"
        width={100}
        height={20}
        priority
      />
    </header>
  );
}