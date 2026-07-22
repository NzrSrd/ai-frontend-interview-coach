import type { Metadata } from "next";
import { ViewTransition } from "react";
import Navbar from "@/components/Navbar";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Frontend Interview Coach",
  description:
    "AI-powered Frontend Interview Coach for React, Next.js, and TypeScript",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark:bg-black dark:text-zinc-400`}
    >
      <body>
        <Navbar />
        <main className="flex min-h-full flex-col">
          <ViewTransition default="page-fade">{children}</ViewTransition>
        </main>
      </body>
    </html>
  );
}
