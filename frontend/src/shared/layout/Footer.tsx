import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { DiscordCTA } from "@/shared/ui/DiscordCTA";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-white px-4 py-6 pb-24 lg:px-6 lg:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="tap-target flex items-center gap-2">
          <Logo size={24} tone="light" />
          <span className="text-xs text-text-muted">· Independent FPL analytics</span>
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-[11px] leading-relaxed text-text-muted">
            Not affiliated with, endorsed by, or connected to the Premier League, the Football Association
            Premier League Limited, or the official Fantasy Premier League game. For informational purposes
            only — not betting, gambling, or financial advice.
          </p>
          <div className="flex shrink-0 items-center gap-x-5 gap-y-1 text-xs">
            <DiscordCTA variant="inline" className="text-text-secondary hover:text-pl-purple" />
            <Link href="/privacy" className="tap-target inline-flex items-center text-text-secondary transition-colors hover:text-pl-purple">
              Privacy
            </Link>
            <Link href="/terms" className="tap-target inline-flex items-center text-text-secondary transition-colors hover:text-pl-purple">
              Terms
            </Link>
            <span className="text-text-muted">© {year} xFPL</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
