"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatTile } from "@/shared/ui/Card";
import { Skeleton } from "@/shared/ui/Skeleton";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { TextField } from "@/shared/ui/TextField";
import { Panel } from "@/shared/ui/Panel";
import { Tabs, TabPanel, type TabItem } from "@/shared/ui/Tabs";
import { nextChip } from "@/shared/lib/chips";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { CaptaincyOptions } from "./components/CaptaincyOptions";
import { ChipPeriodCards } from "./components/ChipPeriodCards";
import { PlannerTable } from "./components/PlannerTable";
import { SquadDetailTable } from "./components/SquadDetailTable";
import { SquadPitch } from "./components/SquadPitch";
import { SuggestedTransfers } from "./components/SuggestedTransfers";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useSwapPreview } from "./hooks/useSwapPreview";

// This panel stacked everything in one scroll (~380 values, with the same 15
// players drawn three separate times). It's four tabs now, and the first is a
// dashboard - the team sheet with the key reads wrapped around it, the way the
// home cockpit works - so the deeper tables are a tap away rather than below.
//
// Planner keeps the squad detail table beside it deliberately: picking a
// replacement there previews in the planner and scrolls to it, so the two want
// to share a panel.
type SquadTab = "squad" | "planner" | "analysis" | "chips";

const SQUAD_TABS: readonly TabItem<SquadTab>[] = [
  { id: "squad", label: "Squad" },
  { id: "planner", label: "Planner" },
  { id: "analysis", label: "Analysis" },
  { id: "chips", label: "Chips" },
];

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
  const [tab, setTab] = useState<SquadTab>("squad");
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

  // Dashboard summaries: one captaincy call and one chip, rather than the full
  // lists behind the Analysis and Chips tabs.
  const topCaptain = data?.captaincy_options?.[0] ?? null;
  const currentCaptain = data?.squad.find((p) => p.captain_flag === "(C)") ?? null;
  const chip = nextChip(chips);

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
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {data.entry_name} - GW{data.event}
            </h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Your dashboard for this team - the numbers that matter around the team sheet.
            </p>
          </div>

          {/* The prose summary line these replace said the same three things in
              a sentence; as tiles they line up with the home dashboard. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={`GW${data.event} points`} value={data.points} tooltip="gwPts" />
            <StatTile label="Squad value" value={`£${data.squad_value}m`} tooltip="squadValue" />
            <StatTile label="In the bank" value={`£${data.bank}m`} tooltip="bankLeft" />
            {/* 3dp, not 1: these scores live in a 0-1 band (0.034 here), so one
                decimal rounds every realistic value to "0.0". */}
            <StatTile
              label="Bench strength"
              value={data.bench_depth_score?.toFixed(3) ?? "-"}
              tooltip="benchStrength"
            />
          </div>

          <Tabs tabs={SQUAD_TABS} value={tab} onChange={setTab} label="Squad views" />

          {/* Dashboard view: the team sheet leads, with the reads that used to be
              separate stacked sections wrapped around it as summary panels, each
              a tap from the tab holding the full version. */}
          <TabPanel id="squad" active={tab === "squad"}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
              <SquadPitch squad={data.squad} bank={data.bank} onReplace={handleReplace} />

              <div className="flex flex-col gap-3">
                <Panel title="Suggested transfer" cta="Planner" onAction={() => setTab("planner")}>
                  <SuggestedTransfers
                    optimizer={optimizer}
                    loading={optimizerLoading}
                    error={optimizerError}
                    onSwitchToOptimize={onSwitchToOptimize}
                    compact
                  />
                </Panel>

                <Panel title="Captaincy pick" cta="All options" onAction={() => setTab("analysis")}>
                  {topCaptain ? (
                    <>
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
                        {topCaptain.web_name}
                        <PositionBadge position={topCaptain.pos} />
                        <TeamBadge teamShort={topCaptain.team_short} name={topCaptain.team_short} />
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-secondary">
                        <span className="font-mono">{topCaptain.ep_next.toFixed(1)}</span> expected points
                        {currentCaptain && currentCaptain.web_name !== topCaptain.web_name
                          ? ` · you have ${currentCaptain.web_name}`
                          : " · matches your armband"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-text-muted">No captaincy read yet.</p>
                  )}
                </Panel>

                <Panel title="Chip timing" cta="Full scan" onAction={() => setTab("chips")}>
                  {chipsLoading && <p className="text-sm text-text-muted">Scanning…</p>}
                  {!chipsLoading && chip && (
                    <>
                      <p className="text-sm font-semibold text-text-primary">
                        {chip.name} <span className="text-pl-purple">· GW{chip.event}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-text-secondary">{chip.detail}</p>
                    </>
                  )}
                  {!chipsLoading && !chip && (
                    <p className="text-sm text-text-muted">No chip worth playing yet.</p>
                  )}
                </Panel>

                <Panel title="Squad strength" cta="Breakdown" onAction={() => setTab("analysis")}>
                  <ul className="flex flex-col">
                    {Object.entries(data.category_scores).map(([pos, score]) => (
                      <li
                        key={pos}
                        className="flex items-center justify-between gap-3 border-t border-border py-1 text-sm first:border-t-0 first:pt-0"
                      >
                        <span className="text-text-secondary">{pos}</span>
                        <span className="font-mono font-semibold text-pl-purple">{score.toFixed(3)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </div>
          </TabPanel>

          <TabPanel id="planner" active={tab === "planner"} className="space-y-8">
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

            <SquadDetailTable
              squad={data.squad}
              bank={data.bank}
              excludeIds={squadLiveIds}
              onReplace={handleReplace}
            />

          </TabPanel>

          <TabPanel id="analysis" active={tab === "analysis"} className="space-y-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Object.entries(data.category_scores).map(([pos, score]) => (
              <StatTile key={pos} label={pos} value={score.toFixed(3)} tooltip="positionScore" />
            ))}
            <StatTile label="Bench depth" value={data.bench_depth_score?.toFixed(3) ?? "-"} tooltip="benchStrength" />
          </div>

          <CaptaincyOptions options={data.captaincy_options} squad={data.squad} />
          </TabPanel>

          {/* Chip strategy - folded in from the old standalone /chips page so
              it lives with the team it's about. */}
          <TabPanel id="chips" active={tab === "chips"}>
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
          </TabPanel>
        </div>
      )}
    </div>
  );
}
