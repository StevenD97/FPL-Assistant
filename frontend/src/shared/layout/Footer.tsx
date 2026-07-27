import Link from "next/link";

// Primary destinations, laid out as one horizontal row so the footer reads as
// a slim band across the full width rather than a tall stacked block. Legal
// links live in the bottom bar next to the copyright.
const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/players", label: "Players" },
  { href: "/outlook", label: "Outlook" },
  { href: "/differentials", label: "Differentials" },
  { href: "/price-watch", label: "Price Watch" },
  { href: "/chips", label: "Chips" },
  { href: "/squad", label: "My Squad" },
  { href: "/leagues", label: "Leagues" },
  { href: "/matches", label: "Matches" },
  { href: "/blog", label: "Blog" },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-white px-4 py-6 pb-24 lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-fpl-logo flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-pl-purple">
              x
            </span>
            <span className="text-sm font-bold text-pl-purple">xFPL</span>
            <span className="hidden text-xs text-text-muted sm:inline">· Independent FPL analytics</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-text-secondary transition-colors hover:text-pl-purple"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-[11px] leading-relaxed text-text-muted">
            Not affiliated with, endorsed by, or connected to the Premier League, the Football Association
            Premier League Limited, or the official Fantasy Premier League game. For informational purposes
            only — not betting, gambling, or financial advice.
          </p>
          <div className="flex shrink-0 items-center gap-x-5 gap-y-1 text-xs">
            <Link href="/privacy" className="text-text-secondary transition-colors hover:text-pl-purple">
              Privacy
            </Link>
            <Link href="/terms" className="text-text-secondary transition-colors hover:text-pl-purple">
              Terms
            </Link>
            <span className="text-text-muted">© {year} xFPL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
