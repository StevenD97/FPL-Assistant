"use client";

import Link from "next/link";
import { useTeam } from "@/shared/team/TeamProvider";
import { Countdown } from "@/shared/ui/Countdown";

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
            className="rounded-md bg-pl-green px-4 py-2.5 text-sm font-bold text-pl-purple transition-[filter] hover:brightness-95"
          >
            View my squad
          </Link>
          <Link
            href="/players"
            className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Research players
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={promptConnect}
            className="rounded-md bg-pl-green px-4 py-2.5 text-sm font-bold text-pl-purple transition-[filter] hover:brightness-95"
          >
            Connect your team
          </button>
          <Link
            href="/squad"
            className="rounded-md border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Build a squad
          </Link>
        </>
      )}
      <span className="flex items-center gap-2 rounded-full border border-pl-green/40 bg-pl-green/10 px-3 py-1.5">
        <span className="animate-fpl-pulse h-1.5 w-1.5 rounded-full bg-pl-green" />
        <span className="text-xs text-[#c9a9d1]">{name ? `Hi, ${name}` : "Next deadline"}</span>
        <Countdown className="text-xs font-semibold text-white" />
      </span>
    </div>
  );
}
