"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { Select } from "@/shared/ui/Select";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { TextField } from "@/shared/ui/TextField";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { Skeleton } from "@/shared/ui/Skeleton";
import { ShortlistStar } from "@/shared/ui/ShortlistStar";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { PlayerPeek } from "@/shared/ui/PlayerPeek";
import { loadSquadDraft, storeSquadDraft } from "@/shared/lib/draft";
import {
  createLocalTeam,
  getLocalTeam,
  updateLocalTeam,
  type LocalTeam,
} from "@/shared/lib/localTeams";
import { useFlash } from "@/shared/lib/useFlash";
import { makeScale, percentileRating } from "@/shared/lib/rating";
import { useSeasonStatus } from "@/shared/lib/useSeasonStatus";
import { apiGet } from "@/shared/lib/api";
import { getAlternatives } from "@/shared/api/squad";
import type {
  BestSquadResult,
  PoolPlayer,
  Position,
  SquadBuilderFixtureRow,
} from "@/shared/types/api";
import {
  computeDiagnostics,
  MAX_PER_CLUB,
  POSITION_LIMITS,
  POSITION_ORDER,
} from "./diagnostics";
import { pickSquadCompletion } from "./completion";
import { InsightCarousel } from "./components/InsightCarousel";
import { TransferSuggestions } from "./components/TransferSuggestions";

// A 15-man squad = a starting XI on the pitch + a 4-man bench. The XI is seeded
// as a 4-4-2 (the neutral default); the bench takes the one-per-position
// overflow (1 GK + 1 DEF + 1 MID + 1 FWD), so pitch + bench sum back to
// POSITION_LIMITS (2/5/5/3). Players fill their position's pitch bucket first.
const PITCH_BUCKET: Record<Position, number> = { GKP: 1, DEF: 4, MID: 4, FWD: 2 };
const MAX_BROWSER_ROWS = 40;


// Matches the builder body: the budget/counter control row, then the
// two-column pitch + player-browser grid.
function BuildSquadSkeleton() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end gap-6">
        <Skeleton className="h-9 w-28 rounded-md" />
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <Skeleton className="mb-3 h-5 w-28" />
          <Skeleton className="h-[420px] w-full rounded-lg" />
        </div>
        <div>
          <Skeleton className="mb-3 h-5 w-20" />
          <div className="mb-3 flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The one squad-building workspace, for both the scratchpad draft and a saved
 * squad. `localTeamId` decides only where edits are persisted - a saved squad
 * *is* an editable squad, so giving it a separate surface would have meant two
 * builders to keep in step.
 */
export function BuildSquadPanel({
  localTeamId,
  onSaved,
}: {
  localTeamId?: string;
  onSaved?: (team: LocalTeam) => void;
}) {
  const [players, setPlayers] = useState<PoolPlayer[] | null>(null);
  const [fixtures, setFixtures] = useState<SquadBuilderFixtureRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [squadIdList, setSquadIdList] = useState<number[]>([]);
  const [budget, setBudget] = useState(100);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "All">("All");
  const [statsId, setStatsId] = useState<number | null>(null);

  // Auto-save to this device. Restore once on mount (in an effect, not a lazy
  // initializer, so server and first client render match); only start persisting
  // after that so the empty initial state can't clobber what was saved.
  //
  // Which store is used is the only thing `localTeamId` changes: a saved squad
  // writes back to itself, the scratchpad writes to the draft.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Restore in an effect (not a lazy initializer) so the server/first-client
    // render stays empty and matches - reading localStorage during render would
    // hydration-mismatch.
    const saved = localTeamId ? getLocalTeam(localTeamId) : null;
    const source = saved
      ? { ids: saved.playerIds, budget: saved.budget }
      : localTeamId
        ? // The id is stale (deleted in another tab); start empty rather than
          // silently editing the unrelated scratchpad.
          { ids: [], budget: 100 }
        : loadSquadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSquadIdList(source.ids);
    setBudget(source.budget);
    setHydrated(true);
  }, [localTeamId]);
  useEffect(() => {
    if (!hydrated) return;
    if (localTeamId) updateLocalTeam(localTeamId, { playerIds: squadIdList, budget });
    else storeSquadDraft({ ids: squadIdList, budget });
  }, [hydrated, squadIdList, budget, localTeamId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [playerPool, fixtureRows] = await Promise.all([
          apiGet<PoolPlayer[]>("/api/squad-builder/players"),
          apiGet<SquadBuilderFixtureRow[]>("/api/squad-builder/fixtures"),
        ]);
        setPlayers(playerPool);
        setFixtures(fixtureRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const playersById = useMemo(() => {
    const map = new Map<number, PoolPlayer>();
    for (const p of players ?? []) map.set(p.id, p);
    return map;
  }, [players]);

  const squadIds = useMemo(() => new Set(squadIdList), [squadIdList]);
  const squad = useMemo(
    () => squadIdList.map((id) => playersById.get(id)).filter((p): p is PoolPlayer => !!p),
    [squadIdList, playersById]
  );

  const totalCost = useMemo(() => squad.reduce((sum, p) => sum + p.cost, 0), [squad]);
  const budgetRemaining = Math.round((budget - totalCost) * 10) / 10;

  const insights = useMemo(
    () => computeDiagnostics(squad, squadIds, fixtures ?? [], players ?? [], budgetRemaining),
    [squad, squadIds, fixtures, players, budgetRemaining]
  );

  const { flash: flashAdded, isFlashed: isJustAdded } = useFlash();

  // Already fetched for the diagnostics - indexing it by team costs nothing and
  // lets the peek colour each fixture by difficulty.
  const fixturesByTeam = useMemo(() => {
    const map = new Map<string, SquadBuilderFixtureRow>();
    for (const row of fixtures ?? []) map.set(row.team, row);
    return map;
  }, [fixtures]);

  // Scales for the peek's dials, built once from the whole pool rather than from
  // the squad - a percentile is only meaningful against everyone available, and 15
  // players wouldn't be a distribution. Only stats where "higher" plainly means
  // "better" get one; cost is judged in context and set-piece orders are already
  // shown as duty chips, which say more than a rank over 500 non-takers would.
  const ratingScales = useMemo(() => {
    const pool = players ?? [];
    return {
      xpts: makeScale(pool.map((p) => p.predicted_points)),
      value: makeScale(pool.map((p) => p.value)),
      ownership: makeScale(pool.map((p) => p.selected_by_percent)),
      minutes: makeScale(pool.map((p) => p.appearance_points)),
    };
  }, [players]);

  // Split the squad into a starting XI (pitch) and a 4-man bench by add order:
  // the first PITCH_BUCKET[pos] of each position start, the overflow benches.
  // Empty counts drive the placeholder-slot templates in both zones.
  const { pitchPlayers, pitchEmptyByPosition, benchByPosition } = useMemo(() => {
    const byPos: Record<Position, PoolPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad) byPos[p.position].push(p);

    const toPitchPlayer = (p: PoolPlayer): PitchPlayer => ({
      id: p.id,
      name: p.web_name,
      position: p.position,
      teamShort: p.team_short,
      photo: p.player_photo,
      teamKit: p.team_kit,
      subtitle: `${p.predicted_points.toFixed(1)} xPts`,
      burst: isJustAdded(p.id) ? "pop" : undefined,
    });

    const pitch = POSITION_ORDER.flatMap((pos) => byPos[pos].slice(0, PITCH_BUCKET[pos]).map(toPitchPlayer));
    const bench = {} as Record<Position, PoolPlayer[]>;
    const pitchEmpty = {} as Record<Position, number>;
    for (const pos of POSITION_ORDER) {
      const onPitch = Math.min(byPos[pos].length, PITCH_BUCKET[pos]);
      bench[pos] = byPos[pos].slice(PITCH_BUCKET[pos]);
      pitchEmpty[pos] = PITCH_BUCKET[pos] - onPitch;
    }
    return { pitchPlayers: pitch, pitchEmptyByPosition: pitchEmpty, benchByPosition: bench };
  }, [squad, isJustAdded]);

  const statsPlayer = statsId != null ? playersById.get(statsId) ?? null : null;

  function canAdd(player: PoolPlayer): { ok: boolean; reason?: string } {
    if (squadIds.has(player.id)) return { ok: false, reason: "Already in squad" };
    if (squadIdList.length >= 15) return { ok: false, reason: "Squad full" };
    const posCount = squad.filter((p) => p.position === player.position).length;
    if (posCount >= POSITION_LIMITS[player.position]) return { ok: false, reason: `${player.position} full` };
    const clubCount = squad.filter((p) => p.team_short === player.team_short).length;
    if (clubCount >= MAX_PER_CLUB) return { ok: false, reason: `Max ${MAX_PER_CLUB} ${player.team_short}` };
    if (totalCost + player.cost > budget + 1e-9) return { ok: false, reason: "Over budget" };
    return { ok: true };
  }

  function addPlayer(id: number) {
    setFinishWarning(null);
    setSquadIdList((prev) => [...prev, id]);
    // A player added from the browser list lands somewhere on the pitch above,
    // which on a narrow screen may be scrolled out of view. Popping the new card
    // is the only signal that the tap did what it said.
    flashAdded(id);
  }

  function removePlayer(id: number) {
    setFinishWarning(null);
    setSquadIdList((prev) => prev.filter((existing) => existing !== id));
  }

  const [finishWarning, setFinishWarning] = useState<string | null>(null);

  // Auto-optimise is an action on this squad, not a separate mode. It used to be
  // a sibling panel behind a Manual/Auto pill pair, which framed them as equal
  // alternatives and threw away your manual work on switching - the solver
  // *produces* a squad, so it belongs as a button that fills this one.
  const season = useSeasonStatus();
  const [optimising, setOptimising] = useState(false);
  const [optimiseError, setOptimiseError] = useState<string | null>(null);
  /** The squad as it was before the last solve, so a solve is undoable. */
  const [preOptimise, setPreOptimise] = useState<number[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  async function autoOptimise() {
    setOptimising(true);
    setOptimiseError(null);
    setFinishWarning(null);
    try {
      // `budget` is £m here; the endpoint takes tenths.
      const nextEvent = season?.next_event ?? 1;
      const referenceDate = (season?.next_deadline ?? new Date().toISOString()).slice(0, 10);
      const result = await apiGet<BestSquadResult>(
        `/api/optimizer/best-squad?reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=5&budget=${Math.round(
          budget * 10,
        )}`,
      );
      setPreOptimise(squadIdList);
      setSquadIdList(result.squad.map((r) => r.id));
    } catch (e) {
      setOptimiseError(e instanceof Error ? e.message : "Couldn't reach the optimizer");
    } finally {
      setOptimising(false);
    }
  }

  function undoOptimise() {
    if (preOptimise == null) return;
    setSquadIdList(preOptimise);
    setPreOptimise(null);
  }

  function saveAsTeam() {
    const team = createLocalTeam(saveName, squadIdList, budget);
    setSaveName("");
    setSaving(false);
    onSaved?.(team);
  }

  function finishSquad() {
    if (!players) return;
    const { newIds, skippedPositions } = pickSquadCompletion(players, squad, squadIds, budget);
    if (newIds.length > 0) setSquadIdList((prev) => [...prev, ...newIds]);
    setFinishWarning(
      skippedPositions.length > 0
        ? `Couldn't fill every slot within £${budget.toFixed(1)}m - still need ${[...new Set(skippedPositions)].join(
            ", "
          )}. Try raising the budget or removing an expensive player, then finish again.`
        : null
    );
  }

  function swapPlayer(oldId: number, newId: number) {
    setSquadIdList((prev) => prev.map((id) => (id === oldId ? newId : id)));
  }

  function transferIcon(p: PoolPlayer) {
    return (
      <TransferSuggestions
        playerId={p.id}
        playerName={p.web_name}
        maxCost={budgetRemaining + p.cost}
        excludeIds={squadIdList}
        onSelect={(newId) => swapPlayer(p.id, newId)}
        triggerClassName="h-5 w-5"
      />
    );
  }

  function closeStats() {
    setStatsId(null);
  }

  const filteredPlayers = useMemo(() => {
    if (!players) return [];
    let pool = players;
    if (positionFilter !== "All") pool = pool.filter((p) => p.position === positionFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      // Fuzzy across name / team / position / price. Space-separated tokens
      // must all match, so "liv mid", "haaland", or "£12" all work; a bare
      // number or £-prefixed token is treated as a max price.
      const tokens = q.split(/\s+/);
      pool = pool.filter((p) =>
        tokens.every((tok) => {
          const priceCap =
            tok.startsWith("£") || /^\d+(\.\d+)?$/.test(tok) ? parseFloat(tok.replace("£", "")) : NaN;
          if (!Number.isNaN(priceCap)) return p.cost <= priceCap + 0.05;
          return (
            p.web_name.toLowerCase().includes(tok) ||
            p.team_short.toLowerCase().includes(tok) ||
            p.position.toLowerCase().includes(tok)
          );
        }),
      );
    }
    return pool.slice(0, MAX_BROWSER_ROWS);
  }, [players, positionFilter, search]);

  return (
    <div>
      <p className="mb-5 text-sm text-text-secondary">
        Draft your squad, get live diagnostics, and swap or click into any player.
      </p>

      {loading && <BuildSquadSkeleton />}
      {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

      {players && fixtures && (
        <>
          {/* Progress and the two things you'd do to it. Budget is stated rather
              than presented as a field: it's set once, so an always-visible input
              spent prime space on a decision nobody revisits. It stays readable
              and one click from editable, because it does change the result. */}
          <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* Spend and shape are one readout, split by a rule rather than run
                together - "remaining £31.0m GKP 1/2" read as one sentence. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
              <span>
                <span className="font-mono font-medium text-text-primary">{squadIdList.length}/15</span>{" "}
                players &middot; spent{" "}
                <span className="font-mono font-medium text-text-primary">£{totalCost.toFixed(1)}m</span>{" "}
                &middot; left{" "}
                <span
                  className={`font-mono font-medium ${budgetRemaining < 0 ? "text-danger" : "text-text-primary"}`}
                >
                  £{budgetRemaining.toFixed(1)}m
                </span>
              </span>
              <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
              <span className="flex flex-wrap gap-2.5 font-mono">
                {POSITION_ORDER.map((pos) => {
                  const have = squad.filter((p) => p.position === pos).length;
                  const full = have >= POSITION_LIMITS[pos];
                  return (
                    <span key={pos} className={full ? "text-text-primary" : undefined}>
                      {pos} {have}/{POSITION_LIMITS[pos]}
                    </span>
                  );
                })}
              </span>
            </div>

            {/* Actions share one height so the cluster reads as a set. The solver
                stays the brightest thing here - it's the shortcut worth finding -
                but at the same size as its neighbours rather than a size up. */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" variant="accent" onClick={autoOptimise} disabled={optimising}>
                {optimising ? "Optimising…" : "✦ Auto-optimise"}
              </Button>
              {preOptimise != null && (
                <Button size="sm" variant="ghost" onClick={undoOptimise}>
                  ↩ Undo
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={finishSquad}
                disabled={squadIdList.length >= 15}
                title={
                  squadIdList.length >= 15
                    ? "Squad already full"
                    : "Fill every empty slot with the best affordable available player"
                }
              >
                Fill the gaps
              </Button>

              {/* A setting, not an action - so it sits past a divider and reads as
                  text. Bordering it made a third peer button competing with two
                  things you actually do. */}
              <span aria-hidden="true" className="mx-0.5 hidden h-4 w-px bg-border sm:block" />
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-expanded={settingsOpen}
                className="rounded text-xs text-text-muted transition-colors hover:text-pl-purple"
                title="Change the assumed budget"
              >
                <span className="font-mono">£{budget.toFixed(1)}m</span> budget &middot;{" "}
                <span className="font-semibold underline">{settingsOpen ? "Done" : "Change"}</span>
              </button>
            </div>
          </div>

          <AnimatePresence>
            {settingsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-5 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface-sunken p-3">
                  <TextField
                    label="Budget (£m)"
                    hint="budget"
                    type="number"
                    min={80}
                    max={120}
                    step={0.5}
                    value={budget}
                    onChange={(e) => {
                      setFinishWarning(null);
                      setBudget(Number(e.target.value));
                    }}
                    wrapperClassName="w-28"
                  />
                  <p className="max-w-sm text-xs text-text-muted">
                    The standard game gives you £100.0m. Change it to plan a wildcard around a
                    different bank, or to see what a cheaper squad looks like.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {optimiseError && (
            <div className="mb-5">
              <Alert kind="warning">
                Couldn&apos;t build an optimal squad ({optimiseError}) - your draft is untouched.
              </Alert>
            </div>
          )}

          {/* Saving is what turns a draft into something you can come back to and
              track next to your real team. A saved squad has nothing to save. */}
          {!localTeamId && squadIdList.length > 0 && (
            <div
              className={`mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken px-3 ${
                saving ? "py-3" : "py-2"
              }`}
            >
              {saving ? (
                <>
                  <TextField
                    label="Name this squad"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder="e.g. Wildcard plan"
                    wrapperClassName="min-w-[180px] flex-1"
                  />
                  <Button size="sm" onClick={saveAsTeam}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSaving(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <p className="flex-1 text-xs text-text-secondary">
                    Unsaved draft &mdash; save it to keep it alongside your tracked teams.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => setSaving(true)}>
                    Save as a team
                  </Button>
                </>
              )}
            </div>
          )}

          {finishWarning && (
            <div className="mb-6 -mt-3">
              <Alert kind="warning">{finishWarning}</Alert>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Pitch view - the primary squad surface: a full 15-slot template
                filled from the browser. Tap a slot to filter, a player for
                stats, × to remove. */}
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-text-primary">Your squad</h2>
                <span className="font-mono text-xs text-text-muted">{squadIdList.length}/15</span>
              </div>
              <PitchFormation
                players={pitchPlayers}
                emptyByPosition={pitchEmptyByPosition}
                onPlayerClick={(id) => setStatsId(id)}
                onRemove={removePlayer}
                renderTransfer={(pp) => {
                  const p = playersById.get(pp.id);
                  return p ? transferIcon(p) : null;
                }}
                onSlotClick={(pos) => {
                  setPositionFilter(pos);
                  setSearch("");
                }}
              />

              {/* Bench: 1 GK + 3 outfield (the per-position overflow past the XI). */}
              <div className="mt-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Bench</span>
                  <span className="text-[10px] text-text-muted">GK + 3 outfield</span>
                </div>
                <div className="flex flex-wrap items-start justify-center gap-4">
                  {POSITION_ORDER.map((pos) => {
                    const p = benchByPosition[pos][0];
                    if (p) {
                      return (
                        <div key={pos} className="relative flex h-[76px] flex-col items-center gap-1">
                          <button
                            onClick={() => removePlayer(p.id)}
                            aria-label={`Remove ${p.web_name}`}
                            className="absolute -right-1 -top-1 z-[2] flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white shadow ring-2 ring-white transition-transform hover:scale-110"
                          >
                            ×
                          </button>
                          <div className="absolute -left-1 -top-1 z-[2]">{transferIcon(p)}</div>
                          <button
                            onClick={() => setStatsId(p.id)}
                            aria-label={`View ${p.web_name}'s stats`}
                            className="transition-transform duration-fast ease-standard hover:scale-105"
                          >
                            <PlayerPhoto
                              src={p.player_photo}
                              name={p.web_name}
                              className="h-11 w-11 rounded-full border-2 border-border-strong bg-white object-cover object-top text-[10px]"
                            />
                          </button>
                          <span className="whitespace-nowrap text-[11px] font-medium text-text-primary">{p.web_name}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={pos}
                        onClick={() => {
                          setPositionFilter(pos);
                          setSearch("");
                        }}
                        aria-label={`Add a bench ${pos}`}
                        className="group flex h-[76px] flex-col items-center gap-1"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border-strong text-[10px] font-bold text-text-muted transition-colors group-hover:border-pl-purple group-hover:text-pl-purple">
                          {pos}
                        </span>
                        <span className="text-[11px] font-medium text-text-muted">Add {pos}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="mt-2 text-center text-xs text-text-muted">
                Tap an empty slot to filter the list · tap a player for stats · × to remove
              </p>
            </div>

            {/* Player browser */}
            <div>
              <h2 className="mb-3 font-semibold text-text-primary">
                Players
              </h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <TextField
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, team, position, price…  try “liv mid” or “£12”"
                  wrapperClassName="flex-1"
                />
                <Select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value as Position | "All")}
                  options={["All", ...POSITION_ORDER]}
                  wrapperClassName="w-28"
                />
              </div>
              <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-surface-sunken">
                    <tr>
                      <th className="w-8 px-2 py-2.5 sm:px-3"></th>
                      <th className="px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                      <th className="px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                      <th className="hidden px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:table-cell">Pos</th>
                      <th className="px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Cost</th>
                      <th className="px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        <span className="inline-flex items-center gap-1">
                          Pred pts <InfoTooltip term="xPts" />
                        </span>
                      </th>
                      <th className="hidden px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          Value <InfoTooltip term="value" />
                        </span>
                      </th>
                      <th className="hidden px-2 py-2.5 sm:px-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:table-cell">
                        <span className="inline-flex items-center gap-1">
                          Own% <InfoTooltip term="ownership" />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((p) => {
                      const inSquad = squadIds.has(p.id);
                      const { ok, reason } = canAdd(p);
                      const clickable = inSquad || ok;
                      return (
                        <tr
                          key={p.id}
                          onClick={() => {
                            if (inSquad) removePlayer(p.id);
                            else if (ok) addPlayer(p.id);
                          }}
                          aria-disabled={!clickable}
                          title={!clickable ? reason : inSquad ? "Click to remove" : "Click to add"}
                          className={`border-t border-border transition-colors duration-fast ease-standard ${
                            inSquad
                              ? "cursor-pointer bg-pl-green/10 hover:bg-pl-green/15"
                              : clickable
                              ? "cursor-pointer hover:bg-surface-sunken"
                              : "cursor-not-allowed opacity-45"
                          }`}
                        >
                          <td className="px-2 py-2.5 sm:px-3">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                                inSquad
                                  ? "bg-pl-green text-pl-purple"
                                  : "border border-border-strong text-text-muted"
                              }`}
                              aria-hidden="true"
                            >
                              {inSquad ? "✓" : "+"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 sm:px-3 font-medium text-text-primary">
                            {p.web_name}
                            <StatusBadge status={p.status} news={p.news} />
                            <ShortlistStar id={p.id} className="ml-1.5 align-middle text-sm" />
                          </td>
                          <td className="px-2 py-2.5 sm:px-3">
                            <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                          </td>
                          <td className="hidden px-2 py-2.5 sm:px-3 sm:table-cell">
                            <PositionBadge position={p.position} />
                          </td>
                          <td className="px-2 py-2.5 sm:px-3 font-mono">£{p.cost.toFixed(1)}m</td>
                          <td className="px-2 py-2.5 sm:px-3 font-mono">{p.predicted_points.toFixed(1)}</td>
                          <td className="hidden px-2 py-2.5 sm:px-3 font-mono sm:table-cell">{p.value.toFixed(2)}</td>
                          <td className="hidden px-2 py-2.5 sm:px-3 font-mono sm:table-cell">{p.selected_by_percent.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <h2 className="mb-3 font-semibold text-text-primary">Feedback</h2>
            {squadIdList.length === 0 ? (
              <p className="text-sm text-text-muted">Feedback appears here as you draft your squad.</p>
            ) : insights.length === 0 ? (
              <Alert kind="success">No issues found so far - looking balanced.</Alert>
            ) : (
              <InsightCarousel key={squadIdList.join(",")} insights={insights} onAddPlayer={addPlayer} />
            )}
          </div>
        </>
      )}

      {/* Opened by tapping a player on the pitch. The shared peek carries the
          identity (PlayerCard) and the read; the builder supplies the actions
          only it can do - swap this slot, drop the player. */}
      {statsPlayer && (
        <PlayerPeek
          player={{
            id: statsPlayer.id,
            name: statsPlayer.web_name,
            position: statsPlayer.position,
            teamShort: statsPlayer.team_short,
            teamBadge: statsPlayer.team_badge,
            photo: statsPlayer.player_photo,
            cost: statsPlayer.cost,
            predictedPoints: statsPlayer.predicted_points,
            fixtureCount: statsPlayer.fixture_count,
            fixtureTicker: statsPlayer.fixture_ticker,
            fixtures: (fixturesByTeam.get(statsPlayer.team_short)?.fixtures ?? []).map((f) => ({
              opponent: f.opponent,
              isHome: f.is_home,
              difficulty: f.difficulty,
              badgeUrl: f.opponent_badge,
            })),
            ownership: statsPlayer.selected_by_percent,
            value: statsPlayer.value,
            status: statsPlayer.status,
            news: statsPlayer.news,
            penaltiesOrder: statsPlayer.penalties_order,
            freekicksOrder: statsPlayer.direct_freekicks_order,
            cornersOrder: statsPlayer.corners_and_indirect_freekicks_order,
            ratedStats: [
              {
                k: "xPts",
                v: statsPlayer.predicted_points.toFixed(1),
                tooltip: "xPts",
                rating: percentileRating(statsPlayer.predicted_points, ratingScales.xpts) ?? undefined,
              },
              {
                k: "Value",
                v: statsPlayer.value.toFixed(2),
                tooltip: "value",
                rating: percentileRating(statsPlayer.value, ratingScales.value) ?? undefined,
              },
              {
                k: "Owned",
                v: `${statsPlayer.selected_by_percent.toFixed(1)}%`,
                tooltip: "ownership",
                rating: percentileRating(statsPlayer.selected_by_percent, ratingScales.ownership) ?? undefined,
              },
              {
                k: "Minutes",
                v: statsPlayer.appearance_points.toFixed(1),
                rating: percentileRating(statsPlayer.appearance_points, ratingScales.minutes) ?? undefined,
              },
            ],
          }}
          onClose={closeStats}
          replace={{
            load: () =>
              getAlternatives(statsPlayer.id, {
                limit: 3,
                exclude: squadIdList,
                maxCost: budgetRemaining + statsPlayer.cost,
              }),
            onSelect: (candidateId) => swapPlayer(statsPlayer.id, candidateId),
          }}
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  removePlayer(statsPlayer.id);
                  closeStats();
                }}
              >
                Remove
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
