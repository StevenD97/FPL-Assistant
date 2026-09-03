"use client";

import Link from "next/link";
import { CockpitShell } from "./components/CockpitShell";

/**
 * What the landing page shows when the squad call failed for a reason that
 * isn't "this manager has no picks".
 *
 * This state did not exist. Every failure - a 502 from the FPL API, a 500 from
 * us, a backend that took too long to wake - fell through to the pre-season
 * cockpit, so the product's answer to "we don't know" was to assert that the
 * season hadn't started. Saying "we couldn't load this, try again" is both
 * true and recoverable; the previous behaviour was neither.
 */
export function CockpitError({
  message,
  onRetry,
  teamName,
}: {
  message: string;
  onRetry: () => void;
  teamName: string | null;
}) {
  return (
    <CockpitShell
      eyebrow="Couldn't load your squad"
      title={teamName ? `We're having trouble, ${teamName}` : "We're having trouble"}
      subtitle="This is on us, not your team. The rest of the site still works."
    >
      <div className="rounded-lg border border-white/15 bg-surface/[0.07] p-3.5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-300">
          What went wrong
        </p>
        <p className="mt-1.5 text-sm text-white">{message}</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-ink-900 transition-transform hover:scale-[1.02]"
        >
          Try again
        </button>
        <Link
          href="/players"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/20 bg-surface/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-surface/15"
        >
          Browse players →
        </Link>
      </div>
    </CockpitShell>
  );
}
