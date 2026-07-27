import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-white px-4 py-6 pb-24 lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="bg-fpl-logo flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold text-pl-purple">
              x
            </span>
            <span className="text-sm font-bold text-pl-purple">xFPL</span>
          </div>
          <p className="max-w-lg text-xs leading-relaxed text-text-muted">
            Independent Fantasy Premier League analytics. Not affiliated with, endorsed by, or connected to
            the Premier League, the Football Association Premier League Limited, or the official Fantasy
            Premier League game. For informational purposes only — not betting, gambling, or financial advice.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href="/privacy" className="text-text-secondary transition-colors hover:text-pl-purple">
            Privacy
          </Link>
          <Link href="/terms" className="text-text-secondary transition-colors hover:text-pl-purple">
            Terms
          </Link>
          <Link href="/blog" className="text-text-secondary transition-colors hover:text-pl-purple">
            Blog
          </Link>
          <span className="text-xs text-text-muted">© {year} xFPL</span>
        </nav>
      </div>
    </footer>
  );
}
