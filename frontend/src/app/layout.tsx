import type { Metadata } from "next";
import Link from "next/link";
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
  title: "FPL Assistant",
  description: "Transfer, captaincy, and chip recommendations for Fantasy Premier League",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-6 border-b border-zinc-200 bg-white px-8 py-4 text-sm font-medium dark:border-zinc-800 dark:bg-black">
          <Link href="/" className="text-black dark:text-zinc-50">
            Fixtures
          </Link>
          <Link href="/squad" className="text-black dark:text-zinc-50">
            My Squad
          </Link>
          <Link href="/differentials" className="text-black dark:text-zinc-50">
            Differentials
          </Link>
          <Link href="/chips" className="text-black dark:text-zinc-50">
            Chip Strategy
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
