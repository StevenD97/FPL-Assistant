"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatTile } from "@/shared/ui/Card";
import { Skeleton } from "@/shared/ui/Skeleton";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { TextField } from "@/shared/ui/TextField";
import { StatBar } from "@/shared/ui/StatBar";
import { Inspector } from "@/shared/ui/Inspector";
import { Pending } from "@/shared/ui/Pending";
import { nextChip } from "@/shared/lib/chips";
import { DEFAULT_RISK_KEY, riskCeilingFor, type OwnershipKey } from "@/shared/lib/ownership";
import { CaptaincyOptions } from "./components/CaptaincyOptions";
import { ThisWeek } from "./components/ThisWeek";
import { TransferPlan } from "./components/TransferPlan";
import { ChipPeriodCards } from "./components/ChipPeriodCards";
import { FixtureOutlook, fixtureOutlookSummary } from "./components/FixtureOutlook";
import { SquadDifferentials, differentialsSummary } from "./components/SquadDifferentials";
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
// How many gameweeks the transfer plan solves over. Five is the same horizon
// every other projection on this page uses, so the plan and the numbers beside
// it are answering the question over the same window.
const PLAN_WINDOW = 5;

const READ_TITLES: Record<SquadRead, string> = {
  transfers: "Suggested transfers",
  plan: "Best sequence",
  captaincy: "Captaincy options",
  chips: "Chip strategy",
  fixtures: "Fixture outlook",
  differentials: "Differentials",
  strength: "Squad strength",
  detail: "Squad detail",
  setup: "Team setup",
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
  initialTeamId,
  embedded = false,
}: {
  /** When set (workspace mode), load this exact team instead of the connected one. */
  initialTeamId?: number;
  /** Workspace mode: the switcher labels the team, so hide the intro + team-ID input. */
  embedded?: boolean;
}) {
  // Seeded from the team this panel was opened for, not left empty and filled
  // in later. The render-time re-seed further down only fires when activeId
  // *changes*, so an empty initial value stayed empty for the whole first
  // load - which left the ID field blank and anything keyed on it (the
  // sequence solver) with nothing to work from.
  const [teamId, setTeamId] = useState(initialTeamId != null ? String(initialTeamId) : "");
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [read, setRead] = useState<SquadRead | null>(null);
  // Formation edits are local state inside SquadPitch (it's the only place
  // that needs them), so its net effect on the predicted score - and whether
  // the preview leaves the real captain out of the XI - comes back up through
  // this rather than being recomputed here from state this panel doesn't have.
  const [previewEffect, setPreviewEffect] = useState<{
    pointsDelta: number;
    captainAffected: boolean;
    previewCaptainName: string | null;
  }>({ pointsDelta: 0, captainAffected: false, previewCaptainName: null });
  // Lives here rather than inside the Differentials read so the rail's summary
  // counts against the same ceiling the read is showing, and so the setting
  // survives closing and reopening the panel.
  const [riskKey, setRiskKey] = useState<OwnershipKey>(DEFAULT_RISK_KEY);
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
    costs: swapCosts,
    loading: swapLoading,
    selectCandidate,
    undo: undoSwap,
    resetAll: resetSwaps,
  } = useSwapPreview(plannerRes.data);
  // Picking a replacement (pitch icon, detail table, peek, or a planner-row
  // drop) applies straight to that slot everywhere it's shown - pitch, bench,
  // detail table, planner row - rather than sending the reader off to a read
  // they didn't ask to open. It used to switch the Inspector to "planner" to
  // make the effect visible; the pitch showing it directly replaced that.
  const handleReplace = selectCandidate;

  // Flattened so the markup below reads the same as it did when all of this was
  // local state - the render output is unchanged, only where the values come
  // from has moved.
  const { data, loading, error } = squadRes;
  const { data: optimizer, loading: optimizerLoading, error: optimizerError } = optimizerRes;
  const { data: planner } = plannerRes;
  const { data: chips, loading: chipsLoading, error: chipsError } = chipsRes;

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
  // What a preview actually costs: each swap's candidate price less the
  // player it replaces, summed. Passed to the pitch/detail table as the
  // *effective* bank so a second swap's affordability reflects money the
  // first one freed up, not just the real, un-previewed balance.
  const swapCostDelta = data
    ? Object.entries(swapCosts).reduce((sum, [liveIdStr, candidateCost]) => {
        const original = data.squad.find((p) => p.live_id === Number(liveIdStr));
        return original ? sum + (candidateCost - original.cost) : sum;
      }, 0)
    : 0;
  const effectiveBank = data ? Math.round((data.bank - swapCostDelta) * 10) / 10 : 0;
  // Both new reads summarise from data already loaded: fixture_outlook ships with
  // the squad response, ownership now ships on each squad player.
  const riskMax = riskCeilingFor(riskKey);
  const outlookSummary = data ? fixtureOutlookSummary(data.fixture_outlook) : null;
  const diffSummary = data ? differentialsSummary(data.squad, riskMax) : null;

  // The peek's Next section shows difficulty, and SquadPlayer.next_opponent is
  // only a string - so take the structured opponents from the planner, which is
  // already loaded for its own read. Keyed by squad id, first gameweek onward.
  const nextFixtures = useMemo(() => {
    const map = new Map<number, { opponent: string; isHome: boolean; difficulty: number }[]>();
    for (const p of planner?.players ?? []) {
      const upcoming = p.trajectory
        .flatMap((row) => row.opponents)
        .map((o) => ({ opponent: o.team, isHome: o.is_home, difficulty: o.difficulty }));
      if (upcoming.length > 0) map.set(p.id, upcoming.slice(0, 5));
    }
    return map;
  }, [planner]);

  // The rail is the menu and the overview at once - except for the two rows
  // "This week" has already answered directly above it. Those two carried the
  // same conclusion a second time, 400px lower, which made the page look like
  // it had two opinions when it had one. They now say what opening them gets
  // you, which is what a menu row is for. The one exception is a warning: if a
  // pitch preview has stranded the armband, that is new information and not a
  // restatement, so it still surfaces here.
  const readRows: ReadRow[] = [
    {
      id: "transfers",
      label: "Suggested transfers",
      summary: optimizerLoading ? "Solving…" : "The full working, and the alternatives considered",
    },
    {
      id: "plan",
      label: "Best sequence",
      // Named to distinguish it from the Transfer Plan workspace above, which
      // is where *you* plan. This is what the solver would do.
      summary: `The next ${PLAN_WINDOW} gameweeks solved together, so a free transfer can roll`,
    },
    {
      id: "captaincy",
      label: "Captaincy",
      summary: previewEffect.captainAffected ? (
        <span className="font-medium text-warning">
          Your captain isn&apos;t in the previewed XI - reassign the armband
        </span>
      ) : (
        "The top five, ranked, with the reasoning for each"
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
      // The 5-gameweek average FDR, on the dashboard rather than three clicks
      // into the Matches page - the reason the payload was being fetched all
      // along.
      id: "fixtures",
      label: "Fixture outlook",
      summary: outlookSummary ? (
        <>
          <span className="font-medium text-success">{outlookSummary.kindest.team_short}</span> easiest (
          <span className="font-mono">{outlookSummary.kindest.avg_difficulty?.toFixed(1)}</span>) ·{" "}
          <span className="font-medium text-danger">{outlookSummary.toughest.team_short}</span> toughest (
          <span className="font-mono">{outlookSummary.toughest.avg_difficulty?.toFixed(1)}</span>)
        </>
      ) : (
        "No fixture read yet"
      ),
    },
    {
      id: "differentials",
      label: "Differentials",
      summary: diffSummary ? (
        <>
          <span className="font-mono font-medium text-danger">{diffSummary.edgeCount}</span> under{" "}
          {riskMax}% ·{" "}
          <span className="font-mono font-medium text-text-primary">{diffSummary.crowdCount}</span> owned by
          the crowd
        </>
      ) : (
        "—"
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
      // Config as a row rather than a control bolted above the dashboard. It's the
      // same interaction as everything else here - pick it, it opens beside the
      // team sheet - and its summary doubles as the stated assumption, so the
      // value stays visible without a field competing for space.
      id: "setup",
      label: "Team setup",
      aside: true,
      summary: (
        <>
          <span className="font-mono font-medium text-text-primary">{freeTransfers}</span> free
          transfer{freeTransfers === 1 ? "" : "s"} assumed
        </>
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

  // The field is user-editable, so it is state seeded from activeId rather than
  // derived from it - and it is re-seeded during render when activeId changes,
  // not in an effect. An effect would paint the previous team's id for a frame
  // first. Only the fetch stays in an effect, which is what an effect is for.
  const [seededFrom, setSeededFrom] = useState<number | null>(initialTeamId ?? null);
  if (seededFrom !== activeId) {
    setSeededFrom(activeId);
    if (activeId != null) setTeamId(String(activeId));
  }

  useEffect(() => {
    if (activeId != null) load(String(activeId), freeTransfers);
    // freeTransfers is deliberately not a dependency: changing it should not
    // silently re-run the whole load, the form's submit does that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div>
      {/* Embedded, config lives in the rail as the "Team setup" row and opens in
          the Inspector like every other read - so the whole section is one
          interaction instead of a control bar plus a menu. Standalone, there's no
          rail to put it in, so the form stays here. */}
      {!embedded && (
        <>
          <p className="mb-6 text-sm text-text-secondary">
            Enter your team ID, or connect your team in the sidebar to load it automatically.{" "}
            <SeasonDataNote mode="archived" />
          </p>
          <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
            <TextField
              label="Team ID"
              hint="teamId"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="e.g. 1178869"
            />
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
              {loading ? "Loading..." : "Load squad"}
            </Button>
          </form>
        </>
      )}

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try{" "}
          <span className="font-semibold text-text-primary">Build from scratch</span> above instead.
        </p>
      )}

      {loading && !data && <SquadViewSkeleton />}

      {data && (
        <div className="space-y-6">
          {/* No heading here. The page already says "My Squad", the switcher
              directly above says which team is selected, and the stat bar
              below is labelled with the gameweek - so a second title and a
              second subtitle were ~200px of a phone screen spent repeating
              what was on either side of them. */}
          {/* One banded bar, headline first, with a context line under each
              number - four equal tiles gave four equal-weight numbers and no
              reading order.
              No info triggers on the first three: a gameweek score, a squad
              value and a bank balance are things a manager already knows how
              to read, and an icon on each turns a summary into a row of
              question marks. Tooltips stay where a number genuinely needs
              defining, further down the page. */}
          <StatBar
            items={[
              {
                label: `GW${data.event} points`,
                value: data.points,
                hint: `${startingCount} in the XI`,
              },
              {
                label: "Squad value",
                value: `£${data.squad_value}m`,
                hint: `${data.squad.length} players`,
              },
              {
                label: "In the bank",
                value: (
                  <span className={swapCostDelta !== 0 ? (effectiveBank < 0 ? "text-danger" : "text-text-primary") : ""}>
                    £{effectiveBank}m
                  </span>
                ),
                hint:
                  swapCostDelta !== 0 ? (
                    effectiveBank < 0 ? (
                      <span className="text-danger">
                        £{Math.abs(swapCostDelta).toFixed(1)}m over budget with this preview
                      </span>
                    ) : (
                      `was £${data.bank}m, before this preview`
                    )
                  ) : effectiveBank > 0 ? (
                    "free to spend"
                  ) : (
                    "nothing spare"
                  ),
              },
              {
                // Points, not the 0-1 internal score this used to print to
                // three decimals. "Bench strength 0.133" is unreadable: no
                // unit, no scale, nothing to compare it against. The bench's
                // expected points for the coming gameweek is the number the
                // Bench Boost decision actually turns on.
                label: "Bench next GW",
                value: `${data.bench_predicted_points.toFixed(1)} pts`,
                hint: `${benchCount} on the bench`,
              },
            ]}
          />

          {/* The answer, before the evidence. */}
          <ThisWeek
            optimizer={optimizer}
            optimizerLoading={optimizerLoading}
            topCaptain={topCaptain}
            currentCaptainName={currentCaptain?.web_name ?? null}
            nextEvent={data.event + 1}
            onOpenTransfers={() => setRead("transfers")}
            onOpenCaptaincy={() => setRead("captaincy")}
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
            <SquadPitch
              squad={data.squad}
              bank={effectiveBank}
              swapPreviews={swapPreviews}
              swapCosts={swapCosts}
              swapLoading={swapLoading}
              onReplace={handleReplace}
              onUndoSwap={undoSwap}
              onResetSwaps={resetSwaps}
              onPreviewEffect={setPreviewEffect}
              nextFixtures={nextFixtures}
            />
            <SquadReadRail rows={readRows} active={read} onSelect={setRead} />
          </div>

          <Inspector
            open={read != null}
            title={read ? READ_TITLES[read] : ""}
            eyebrow={data.entry_name}
            onClose={() => setRead(null)}
          >
            {read === "plan" && teamId && (
              <TransferPlan teamId={Number(teamId)} gwCount={PLAN_WINDOW} freeTransfers={freeTransfers} />
            )}

            {read === "transfers" && (
              <SuggestedTransfers
                optimizer={optimizer}
                loading={optimizerLoading}
                error={optimizerError}
                teamId={teamId}
                freeTransfers={freeTransfers}
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
                {chipsLoading && (
                  <Pending
                    label="Scanning chip timing…"
                    slowLabel="Projecting every player in your squad across the next fifteen gameweeks."
                  />
                )}
                {chipsError && (
                  <Alert kind="warning">
                    Couldn&apos;t scan chip timing ({chipsError}) - the squad is unaffected.
                  </Alert>
                )}
                {chips && (
                  <div className="space-y-5">
                    {chips.periods.map((period) => (
                      <ChipPeriodCards key={period.label} period={period} squad={data.squad} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {read === "fixtures" && (
              <FixtureOutlook
                outlook={data.fixture_outlook}
                squad={data.squad}
                planner={planner}
                // The squad response's own window, not the planner's - the two
                // differ (5 vs 6), and this label describes avg_difficulty.
                windowLabel={`next ${data.fixture_window} gameweeks`}
              />
            )}

            {read === "differentials" && (
              <SquadDifferentials
                squad={data.squad}
                planner={planner}
                riskKey={riskKey}
                onRiskChange={setRiskKey}
              />
            )}

            {read === "strength" && (
              <div>
                <p className="mb-3 text-xs text-text-muted">
                  How each position scores for this squad, and what the bench is worth next gameweek.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {Object.entries(data.category_scores).map(([pos, score]) => (
                    <StatTile key={pos} label={pos} value={score.toFixed(3)} tooltip="positionScore" />
                  ))}
                  <StatTile
                    label="Bench next GW"
                    value={`${data.bench_predicted_points.toFixed(1)} pts`}
                  />
                </div>
              </div>
            )}

            {read === "detail" && (
              <SquadDetailTable
                squad={data.squad}
                bank={effectiveBank}
                swapPreviews={swapPreviews}
                swapCosts={swapCosts}
                swapLoading={swapLoading}
                onReplace={handleReplace}
                onUndoSwap={undoSwap}
              />
            )}

            {read === "setup" && (
              <div>
                <p className="mb-3 text-xs text-text-muted">
                  What the model assumes about your team. These change what the reads above
                  recommend, so they&apos;re stated rather than hidden.
                </p>
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-sunken p-3"
                >
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
                    {loading ? "Reloading…" : "Apply"}
                  </Button>
                  <p className="max-w-sm text-xs text-text-muted">
                    FPL gives you one a week, up to five banked. Match your real bank so the
                    suggested transfers weigh the -4 hit correctly.
                  </p>
                </form>

                {/* The one genuinely destructive control on this page, kept at the
                    bottom of setup rather than beside the squad it would replace. */}
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-text-primary">Refresh from FPL</p>
                    <p className="text-xs text-text-muted">
                      Pull this team&apos;s picks again - use it after you&apos;ve made transfers on
                      the official site.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => load(teamId, freeTransfers)}
                    disabled={loading || !teamId}
                  >
                    {loading ? "Reloading…" : "Reload"}
                  </Button>
                </div>
              </div>
            )}
          </Inspector>
        </div>
      )}
    </div>
  );
}
