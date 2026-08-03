"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatTile } from "@/shared/ui/Card";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { TextField } from "@/shared/ui/TextField";
import { StatBar } from "@/shared/ui/StatBar";
import { Inspector } from "@/shared/ui/Inspector";
import { nextChip } from "@/shared/lib/chips";
import { CaptaincyOptions } from "./components/CaptaincyOptions";
import { ChipPeriodCards } from "./components/ChipPeriodCards";
import { PlannerTable } from "./components/PlannerTable";
import { SquadDetailTable } from "./components/SquadDetailTable";
import { SquadPitch } from "./components/SquadPitch";
import { SquadReadRail, type ReadRow, type SquadRead } from "./components/SquadReadRail";
import { SuggestedTransfers } from "./components/SuggestedTransfers";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useSwapPreview } from "./hooks/useSwapPreview";

// The team sheet is the one thing always on screen here; everything else is a
// "read" you summon beside it and dismiss.
//
// This replaced a tab bar plus a rail of four summary cards, which was two
// navigations to the same content (and two cards that opened the same tab), and
// which threw the pitch away whenever you looked at anything. Now the pitch
// never unmounts - so a formation edit or a swap preview survives opening a
// read - and only one deep thing is on screen at a time.
const READ_TITLES: Record<SquadRead, string> = {
  transfers: "Suggested transfers",
  captaincy: "Captaincy options",
  chips: "Chip strategy",
  strength: "Squad strength",
  detail: "Squad detail",
  planner: "Transfer planner",
};

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
  const [read, setRead] = useState<SquadRead | null>(null);
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
  // A picked replacement previews in the planner, so open that read - the
  // effect is immediately visible instead of something to go hunting for. This
  // used to be a scrollIntoView down a long page; with the planner in the
  // Inspector it just phases in beside the pitch you picked from.
  function handleReplace(originalPlayerId: number, candidateId: number) {
    selectCandidate(originalPlayerId, candidateId);
    setRead("planner");
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
  // lists behind their reads.
  const topCaptain = data?.captaincy_options?.[0] ?? null;
  const currentCaptain = data?.squad.find((p) => p.captain_flag === "(C)") ?? null;
  const chip = nextChip(chips);
  const startingCount = data?.squad.filter((p) => p.role === "Starting XI").length ?? 0;
  const benchCount = (data?.squad.length ?? 0) - startingCount;
  // Strongest line, so the rail's strength row says something specific rather
  // than repeating four numbers the Inspector already lists.
  const bestLine = data
    ? Object.entries(data.category_scores).sort(([, a], [, b]) => b - a)[0]
    : null;
  // Keyed by player id, not a list - count the keys.
  const previewCount = Object.keys(swapPreviews).length;

  // The rail is the menu and the overview at once, so each row carries the
  // readout its summary card used to.
  const readRows: ReadRow[] = [
    {
      id: "transfers",
      label: "Suggested transfers",
      summary: optimizerLoading ? (
        "Solving…"
      ) : optimizer && optimizer.transferred_out.length > 0 ? (
        <>
          <span className="font-medium text-danger">↓ {optimizer.transferred_out[0]?.web_name}</span>
          <span className="mx-1 text-text-muted">→</span>
          <span className="font-medium text-success">↑ {optimizer.transferred_in[0]?.web_name}</span>
          {optimizer.transfers_made > 1 && (
            <span className="text-text-muted"> +{optimizer.transfers_made - 1} more</span>
          )}
        </>
      ) : optimizer ? (
        "Already optimal - no changes"
      ) : (
        "Not available"
      ),
    },
    {
      id: "captaincy",
      label: "Captaincy",
      summary: topCaptain ? (
        <>
          <span className="font-medium text-text-primary">{topCaptain.web_name}</span> ·{" "}
          <span className="font-mono font-medium text-text-primary">{topCaptain.ep_next.toFixed(1)}</span>{" "}
          xP ·{" "}
          {currentCaptain && currentCaptain.web_name !== topCaptain.web_name ? (
            <span className="text-warning">you have {currentCaptain.web_name}</span>
          ) : (
            <span className="text-success">matches your armband</span>
          )}
        </>
      ) : (
        "No read yet"
      ),
    },
    {
      id: "chips",
      label: "Chip timing",
      summary: chipsLoading ? (
        "Scanning…"
      ) : chip ? (
        <>
          <span className="font-medium text-text-primary">{chip.name}</span> ·{" "}
          <span className="font-mono font-medium text-text-primary">GW{chip.event}</span>
        </>
      ) : (
        "Nothing worth playing yet"
      ),
    },
    {
      id: "strength",
      label: "Squad strength",
      summary: bestLine ? (
        <>
          <span className="font-medium text-text-primary">{bestLine[0]}</span> strongest at{" "}
          <span className="font-mono font-medium text-text-primary">{bestLine[1].toFixed(3)}</span>
        </>
      ) : (
        "—"
      ),
    },
    {
      id: "detail",
      label: "Squad detail",
      summary: (
        <>
          <span className="font-mono font-medium text-text-primary">{data?.squad.length ?? 0}</span>{" "}
          players · xGI, ICT, Def/90, set pieces
        </>
      ),
    },
    {
      id: "planner",
      label: "Transfer planner",
      summary: plannerLoading ? (
        "Building outlook…"
      ) : previewCount > 0 ? (
        <>
          <span className="font-mono font-medium text-pl-pink">{previewCount}</span> swap
          {previewCount === 1 ? "" : "s"} previewed
        </>
      ) : (
        "Points outlook per gameweek"
      ),
    },
  ];

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

          {/* One banded bar, headline first, with a context line under each
              number - four equal tiles gave four equal-weight numbers and no
              reading order. */}
          <StatBar
            items={[
              {
                label: `GW${data.event} points`,
                value: data.points,
                hint: `${startingCount} in the XI`,
                tooltip: "gwPts",
              },
              {
                label: "Squad value",
                value: `£${data.squad_value}m`,
                hint: `${data.squad.length} players`,
                tooltip: "squadValue",
              },
              {
                label: "In the bank",
                value: `£${data.bank}m`,
                hint: data.bank > 0 ? "free to spend" : "nothing spare",
                tooltip: "bankLeft",
              },
              {
                // 3dp, not 1: these scores live in a 0-1 band (0.034 here), so
                // one decimal rounds every realistic value to "0.0".
                label: "Bench strength",
                value: data.bench_depth_score?.toFixed(3) ?? "-",
                hint: `${benchCount} on the bench`,
                tooltip: "benchStrength",
              },
            ]}
          />

          {/* The team sheet and the rail share the top row; the read itself opens
              full width underneath.
              It used to open *in* the rail's column, which kept everything on one
              screen but left a read 431px wide on a 1440px display - a quarter of
              the page for the content the reader actually asked for, and prose
              cards wrapping to a few words a line. Beneath the pitch it gets the
              full 1088px while the team sheet stays visible, which was the point
              of moving reads out of tabs in the first place.
              Separating them also retires three workarounds the shared cell
              needed: the rail no longer has to stay mounted-but-hidden to stop the
              column collapsing mid-exit, and the panel no longer needs
              `pointer-events-none` to avoid swallowing clicks on the rail it was
              invisibly covering. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
            <SquadPitch squad={data.squad} bank={data.bank} onReplace={handleReplace} />
            <SquadReadRail rows={readRows} active={read} onSelect={setRead} />
          </div>

          <Inspector
            open={read != null}
            title={read ? READ_TITLES[read] : ""}
            eyebrow={data.entry_name}
            onClose={() => setRead(null)}
          >
            {read === "transfers" && (
              <SuggestedTransfers
                optimizer={optimizer}
                loading={optimizerLoading}
                error={optimizerError}
                teamId={teamId}
                freeTransfers={freeTransfers}
                onSwitchToOptimize={onSwitchToOptimize}
              />
            )}

            {read === "captaincy" && (
              <CaptaincyOptions options={data.captaincy_options} squad={data.squad} />
            )}

            {read === "chips" && (
              <div>
                <p className="mb-3 text-xs text-text-muted">
                  Suggested timing for Bench Boost, Triple Captain, Free Hit, and Wildcard.{" "}
                  {chips && (
                    <>
                      Every manager gets a completely fresh set of all four chips at the GW
                      {chips.reset_event} deadline - anything unused before it is lost, not carried over - so
                      the two halves below are scored independently.
                    </>
                  )}
                </p>
                {chipsLoading && <p className="text-sm text-text-muted">Scanning chip timing…</p>}
                {chipsError && (
                  <Alert kind="warning">
                    Couldn&apos;t scan chip timing ({chipsError}) - the squad is unaffected.
                  </Alert>
                )}
                {chips && (
                  <div className="space-y-5">
                    {chips.periods.map((period) => (
                      <ChipPeriodCards key={period.label} period={period} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {read === "strength" && (
              <div>
                <p className="mb-3 text-xs text-text-muted">
                  How each position scores for this squad, and how much is sitting on the bench.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {Object.entries(data.category_scores).map(([pos, score]) => (
                    <StatTile key={pos} label={pos} value={score.toFixed(3)} tooltip="positionScore" />
                  ))}
                  <StatTile
                    label="Bench depth"
                    value={data.bench_depth_score?.toFixed(3) ?? "-"}
                    tooltip="benchStrength"
                  />
                </div>
              </div>
            )}

            {read === "detail" && (
              <SquadDetailTable
                squad={data.squad}
                bank={data.bank}
                excludeIds={squadLiveIds}
                onReplace={handleReplace}
              />
            )}

            {read === "planner" && (
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
            )}
          </Inspector>
        </div>
      )}
    </div>
  );
}
