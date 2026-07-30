"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatTile } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { Skeleton } from "@/shared/ui/Skeleton";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { TextField } from "@/shared/ui/TextField";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { CaptaincyOptions } from "./components/CaptaincyOptions";
import { ChipPeriodCards } from "./components/ChipPeriodCards";
import { PlannerTable } from "./components/PlannerTable";
import { SquadPitch } from "./components/SquadPitch";
import { SuggestedTransfers } from "./components/SuggestedTransfers";
import { TransferSuggestions } from "./components/TransferSuggestions";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useSwapPreview } from "./hooks/useSwapPreview";



// Stand-in for the loaded squad view: summary lines, the pitch, a bench
// strip, and the two panels (suggested transfers + planner table) below it.
function SquadViewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div>
        <Skeleton className="h-[360px] w-full rounded-lg" />
        <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export function LoadTeamPanel({
  onSwitchToOptimize,
  initialTeamId,
  embedded = false,
}: {
  onSwitchToOptimize?: () => void;
  /** When set (workspace mode), load this exact team instead of the connected one. */
  initialTeamId?: number;
  /** Workspace mode: the switcher labels the team, so hide the intro + team-ID input. */
  embedded?: boolean;
}) {
  const [teamId, setTeamId] = useState("");
  const [freeTransfers, setFreeTransfers] = useState(1);
  const { teamId: connectedId } = useTeam();

  const {
    squad: squadRes,
    optimizer: optimizerRes,
    planner: plannerRes,
    chips: chipsRes,
    load,
  } = useLoadedSquad();
  const {
    previews: swapPreviews,
    loading: swapLoading,
    dragOverRow,
    setDragOverRow,
    drop: handleSwapDrop,
    selectCandidate,
    undo: undoSwap,
  } = useSwapPreview(plannerRes.data);
  const plannerSectionRef = useRef<HTMLDivElement>(null);

  // A picked replacement previews in the Transfer planner table below - jump
  // there so the effect is immediately visible instead of something the
  // reader has to go hunting for further down a long page.
  function handleReplace(originalPlayerId: number, candidateId: number) {
    selectCandidate(originalPlayerId, candidateId);
    plannerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Flattened so the markup below reads the same as it did when all of this was
  // local state - the render output is unchanged, only where the values come
  // from has moved.
  const { data, loading, error } = squadRes;
  const { data: optimizer, loading: optimizerLoading, error: optimizerError } = optimizerRes;
  const { data: planner, loading: plannerLoading, error: plannerError } = plannerRes;
  const { data: chips, loading: chipsLoading, error: chipsError } = chipsRes;
  // What's already owned can't also be a "replacement" - excluded by live id
  // (the id-space player_alternatives itself works in).
  const squadLiveIds = data?.squad.map((p) => p.live_id).filter((id): id is number => id != null) ?? [];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    load(teamId, freeTransfers);
  }

  // Which team this panel should show: an explicit workspace selection wins,
  // otherwise fall back to the team connected via the sidebar. Prefill the
  // field and load it automatically - no need to re-type the ID.
  const activeId = initialTeamId ?? connectedId ?? null;
  useEffect(() => {
    if (activeId != null) {
      setTeamId(String(activeId));
      load(String(activeId), freeTransfers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div>
      {!embedded && (
        <p className="mb-6 text-sm text-text-secondary">
          Enter your team ID, or connect your team in the sidebar to load it automatically.{" "}
          <SeasonDataNote mode="archived" />
        </p>
      )}
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
        {!embedded && (
          <TextField
            label="Team ID"
            hint="teamId"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1178869"
          />
        )}
        <TextField
          label="Free transfers"
          hint="freeTransfers"
          type="number"
          min={0}
          max={5}
          value={freeTransfers}
          onChange={(e) => setFreeTransfers(Number(e.target.value))}
          wrapperClassName="w-28"
        />
        <Button type="submit" disabled={loading || !teamId}>
          {loading ? "Loading..." : embedded ? "Reload" : "Load squad"}
        </Button>
      </form>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try{" "}
          <span className="font-semibold text-text-primary">Build from scratch</span> above instead.
        </p>
      )}

      {loading && !data && <SquadViewSkeleton />}

      {data && (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {data.entry_name} - GW{data.event}
            </h2>
            <p className="flex flex-wrap items-center gap-x-1 text-text-secondary">
              <span>
                <span className="font-mono">{data.points}</span> points that GW <InfoTooltip term="gwPts" />
              </span>
              <span>
                {" - £"}
                <span className="font-mono">{data.squad_value}</span>m squad value <InfoTooltip term="squadValue" />
              </span>
              <span>
                {" - £"}
                <span className="font-mono">{data.bank}</span>m in bank <InfoTooltip term="bankLeft" />
              </span>
            </p>
          </div>

          <SquadPitch squad={data.squad} bank={data.bank} onReplace={handleReplace} />

          <SuggestedTransfers
            optimizer={optimizer}
            loading={optimizerLoading}
            error={optimizerError}
            onSwitchToOptimize={onSwitchToOptimize}
          />

          <div ref={plannerSectionRef}>
            <PlannerTable
              planner={planner}
              loading={plannerLoading}
              error={plannerError}
              swapPreviews={swapPreviews}
              swapLoading={swapLoading}
              dragOverRow={dragOverRow}
              setDragOverRow={setDragOverRow}
              onSwapDrop={handleSwapDrop}
              onUndoSwap={undoSwap}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      Role <InfoTooltip term="role" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      Score <InfoTooltip term="score" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      Next opp <InfoTooltip term="nextOpponent" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      EP next <InfoTooltip term="epNext" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      xGI <InfoTooltip term="xgi" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      ICT <InfoTooltip term="ictIndex" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      Def/90 <InfoTooltip term="def90" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      Set-piece duty <InfoTooltip term="setPieceDuty" />
                    </span>
                  </th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.squad.map((p) => (
                  <tr key={p.position} className="border-t border-border">
                    <td className="px-3 py-2.5 font-medium">
                      <PlayerLink id={p.live_id}>{p.web_name}</PlayerLink> {p.captain_flag}
                    </td>
                    <td className="px-3 py-2.5">
                      <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PositionBadge position={p.pos} />
                    </td>
                    <td className="px-3 py-2.5">{p.role}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {p.recommendation_score.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5">{p.next_opponent}</td>
                    <td className="px-3 py-2.5 font-mono">{p.ep_next}</td>
                    <td className="px-3 py-2.5 font-mono">{p.expected_goal_involvements}</td>
                    <td className="px-3 py-2.5 font-mono">{p.ict_index}</td>
                    <td className="px-3 py-2.5 font-mono">{p.defensive_contribution_per_90}</td>
                    <td className="px-3 py-2.5 font-mono">{p.set_piece_duty_score.toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      {p.live_id != null && (
                        <TransferSuggestions
                          playerId={p.live_id}
                          playerName={p.web_name}
                          maxCost={data.bank + p.cost}
                          excludeIds={squadLiveIds}
                          onSelect={(candidateId) => handleReplace(p.live_id!, candidateId)}
                          trigger="Suggest"
                          triggerClassName="text-xs text-pl-purple hover:underline"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Object.entries(data.category_scores).map(([pos, score]) => (
              <StatTile key={pos} label={pos} value={score.toFixed(3)} tooltip="positionScore" />
            ))}
            <StatTile label="Bench depth" value={data.bench_depth_score?.toFixed(3) ?? "-"} tooltip="benchStrength" />
          </div>

          <CaptaincyOptions options={data.captaincy_options} squad={data.squad} />

          {/* Chip strategy - folded in from the old standalone /chips page so
              it lives with the team it's about. */}
          <div>
            <h3 className="mb-1 font-semibold text-text-primary">Chip strategy</h3>
            <p className="mb-3 text-xs text-text-muted">
              Suggested timing for Bench Boost, Triple Captain, Free Hit, and Wildcard.{" "}
              {chips && (
                <>
                  Every manager gets a completely fresh set of all four chips at the GW{chips.reset_event} deadline
                  - anything unused before it is lost, not carried over - so the two halves below are scored
                  independently.
                </>
              )}
            </p>
            {chipsLoading && <p className="text-sm text-text-muted">Scanning chip timing…</p>}
            {chipsError && (
              <Alert kind="warning">Couldn&apos;t scan chip timing ({chipsError}) - the squad above is unaffected.</Alert>
            )}
            {chips && (
              <div className="space-y-5">
                {chips.periods.map((period) => (
                  <ChipPeriodCards key={period.label} period={period} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
