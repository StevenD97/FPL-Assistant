"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Fixtures" },
  { href: "/outlook", label: "Outlook" },
  { href: "/squad", label: "My Squad" },
  { href: "/optimizer", label: "Optimizer" },
  { href: "/squad-builder", label: "Squad Builder" },
  { href: "/differentials", label: "Differentials" },
  { href: "/chips", label: "Chip Strategy" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6 border-b border-border bg-white px-8 py-4">
      <span className="mr-2 font-sans text-md font-bold text-pl-purple">FPL Assistant</span>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
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
