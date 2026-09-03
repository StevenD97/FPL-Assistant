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
    <>
      <div className="rounded-lg border border-border bg-surface px-4 py-3.5 lg:px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-5 w-56" />
          </div>
          <Skeleton className="h-5 w-36" />
        </div>
        <Skeleton className="mt-3 h-4 w-full max-w-lg" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </>
  );
}
