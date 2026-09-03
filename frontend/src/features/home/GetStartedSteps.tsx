"use client";

import Link from "next/link";
import { Card } from "@/shared/ui/Card";
import { NavIcon, type IconName } from "@/shared/layout/icons";
import { useTeam } from "@/shared/team/TeamProvider";

// The landing page's guided path: connect/build -> get recommendations ->
// track the gameweek. Step 1 reads real connection state from TeamProvider
// (already used by the sidebar) rather than staying purely decorative -
// the intent is for this to be the seed a future first-time-use tutorial
// builds on, so it needs to actually know where the visitor is, not just
// describe the app.
function Step({
  number,
  icon,
  title,
  children,
}: {
  number: string;
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col gap-2.5 p-5">
      <span className="pointer-events-none absolute right-4 top-3 font-mono text-3xl font-extrabold text-text-primary/10">
        {number}
      </span>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-text-primary">
        <NavIcon name={icon} className="h-4 w-4" />
      </span>
      <span className="text-sm font-bold text-text-primary">{title}</span>
      {children}
    </div>
  );
}

export function GetStartedSteps() {
  const { entry, promptConnect } = useTeam();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-text-primary/60">Get started</span>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">Three steps from sign-up to matchday.</h2>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Step number="01" icon="squad" title="Connect or build your squad">
            {entry ? (
              <>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Connected as{" "}
                  <span className="font-semibold text-text-primary">
                    {entry.player_name ?? entry.team_name ?? `Team ${entry.id}`}
                  </span>
                  .
                </p>
                <Link href="/squad" className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline">
                  View my squad →
                </Link>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-text-secondary">
                  Enter your real Team ID, or draft one from scratch in a couple of minutes.
                </p>
                <button
                  type="button"
                  onClick={promptConnect}
                  className="text-left tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline"
                >
                  Connect your team →
                </button>
              </>
            )}
          </Step>

          <Step number="02" icon="outlook" title="Get your recommendations">
            <p className="text-xs leading-relaxed text-text-secondary">
              Predicted points, suggested transfers, and captaincy picks - recomputed every gameweek.
            </p>
            <Link href="/players" className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline">
              See predictions →
            </Link>
          </Step>

          <Step number="03" icon="leagues" title="Track your gameweek">
            {/* No "once GW1 kicks off" - the season is under way, and copy
                that waits for a kick-off eleven months in the past is how the
                whole product came to read as abandoned. */}
            <p className="text-xs leading-relaxed text-text-secondary">
              Watch your score update through the gameweek, get nudged on chip timing, and follow
              your mini-leagues.
            </p>
            <Link href="/leagues" className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline">
              Track leagues →
            </Link>
          </Step>
        </div>
      </Card>
    </div>
  );
}
