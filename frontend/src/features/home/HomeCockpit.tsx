"use client";

import { useTeam } from "@/shared/team/TeamProvider";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useCockpit } from "./hooks/useCockpit";
import { LiveCockpit } from "./LiveCockpit";
import { WaitingCockpit } from "./WaitingCockpit";
import { CockpitError } from "./CockpitError";

/**
 * The landing page's centrepiece for a connected manager, replacing the
 * marketing hero (which a manager who has already signed up doesn't need).
 * Signed-out visitors never render this - see app/page.tsx.
 */
export function HomeCockpit() {
  const { teamId, entry } = useTeam();
  const state = useCockpit(teamId);
  const teamName = entry?.team_name ?? null;

  switch (state.kind) {
    case "loading":
      return <CockpitSkeleton />;
    case "live":
      return <LiveCockpit data={state.data} entry={entry} />;
    case "error":
      return (
        <CockpitError message={state.message} onRetry={state.retry} teamName={teamName} />
      );
    case "waiting":
      return <WaitingCockpit data={state.data} teamName={teamName} />;
  }
}

/** Mirrors the hero's shape so the page doesn't jump when the data lands. */
function CockpitSkeleton() {
  return (
    <div className="bg-fpl-hero relative overflow-hidden rounded-lg p-6 lg:p-8">
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,176,32,0.16),transparent_70%)]" />
      <div className="relative flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-32 bg-surface/20" />
            <Skeleton className="h-7 w-56 bg-surface/20" />
          </div>
          <Skeleton className="h-16 w-36 rounded-lg bg-surface/20" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-lg bg-surface/20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-lg bg-surface/20" />
          <Skeleton className="h-40 rounded-lg bg-surface/20" />
        </div>
      </div>
    </div>
  );
}
