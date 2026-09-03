"use client";

import Link from "next/link";
import { useTeam } from "@/shared/team/TeamProvider";

// Hero call-to-action row, personalised by connection state: a returning
// manager gets straight into their squad, a new visitor gets the connect /
// build path. Kept as a small client island inside the server-rendered hero.
export function HeroActions() {
  const { entry, promptConnect } = useTeam();
  const name = entry?.player_name ?? entry?.team_name ?? null;

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      {entry ? (
        <>
          <Link
            href="/squad"
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-ink-900 transition-[filter] hover:brightness-95"
          >
            View my squad
          </Link>
          <Link
            href="/players"
            className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-sunken"
          >
            Research players
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={promptConnect}
            className="rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-ink-900 transition-[filter] hover:brightness-95"
          >
            Connect your team
          </button>
          <Link
            href="/squad"
            className="rounded-md border border-border-strong px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-sunken"
          >
            Build a squad
          </Link>
        </>
      )}
      {/* No countdown here. The sidebar carries one on every page, and this sat
          400px from it on the same screen - the same value, twice, rendered by
          the same component. A greeting is not a duplicate, so that stays. */}
      {name && <span className="text-sm text-text-secondary">Hi, {name}</span>}
    </div>
  );
}
