"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/fixtures", label: "Fixtures" },
  { href: "/schedule", label: "Schedule" },
  { href: "/players", label: "Players" },
  { href: "/outlook", label: "Outlook" },
  { href: "/squad", label: "My Squad" },
  { href: "/squad-builder", label: "Squad Builder" },
  { href: "/optimizer", label: "Optimizer" },
  { href: "/differentials", label: "Differentials" },
  { href: "/chips", label: "Chips" },
  { href: "/leagues", label: "Leagues" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-white px-8 py-4">
      <Link href="/" className="mr-2 font-sans text-md font-bold text-pl-purple">
        FPL Assistant
      </Link>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b-2 pb-1 text-sm font-medium transition-colors duration-base ease-standard ${
              active ? "border-pl-green text-pl-purple" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
