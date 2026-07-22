"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  return (
    <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-center border-b border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400 gap-4">
      <div className="flex w-full max-w-3xl items-center">
        {/* Grows to push the logo to center when the button is hidden */}
        <div
          aria-hidden
          className="transition-[flex-grow] duration-300 ease-in-out"
          style={{ flexGrow: isHomePage ? 0 : 1 }}
        />
        <Link href="/" aria-label="Home">
          <Image
            src="/logo.png"
            alt="NextStep logo"
            width={45}
            height={20}
            priority
          />
        </Link>
        {/* Always reserves matching flex space; holds the button on the home page */}
        <div className="flex flex-1 justify-end">
          <Link
            href="/eval"
            aria-hidden={!isHomePage}
            tabIndex={isHomePage ? undefined : -1}
            className={`inline-flex w-fit items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity duration-300 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200 ${
              isHomePage ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            Eval Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
