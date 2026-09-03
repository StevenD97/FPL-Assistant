import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Public_Sans } from "next/font/google";
import { AppShell } from "@/shared/layout/AppShell";
import { TeamProvider } from "@/shared/team/TeamProvider";
import "./globals.css";

/**
 * Three faces, each doing one job, and none of them the framework default.
 *
 * Geist is what Next.js ships with. Shipping it unchanged tells a visitor
 * exactly one thing about the product, which is that nobody chose anything -
 * and every other tool in this category is a dark, opinionated dashboard.
 *
 * Archivo is a grotesque with real width and weight at display sizes, which is
 * what a scoreline set at 48px needs. Public Sans is a humanist body face -
 * open apertures, readable at 14px in a dense table, and not Inter. JetBrains
 * Mono is for aligned columns only: points, prices, countdowns, deltas. The
 * rule is that mono means "this number lines up with the one below it", and a
 * price sitting inside a sentence does not.
 */
const display = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "xFPL",
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
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TeamProvider>
          <AppShell>{children}</AppShell>
        </TeamProvider>
      </body>
    </html>
  );
}
