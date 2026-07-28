"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { StatTile } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { Select } from "@/shared/ui/Select";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { TextField } from "@/shared/ui/TextField";
import { Skeleton } from "@/shared/ui/Skeleton";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { PitchFormation } from "@/shared/pitch/PitchFormation";
import { loadSquadDraft, storeSquadDraft } from "@/shared/lib/draft";
import { API_URL } from "@/shared/lib/api";


type Position = "GKP" | "DEF" | "MID" | "FWD";

type PoolPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: Position;
  predicted_points: number;
  value: number;
  selected_by_percent: number;
  status: string;
  news: string;
  penalties_order: number;
  direct_freekicks_order: number;
  corners_and_indirect_freekicks_order: number;
  appearance_points: number;
  fixture_count: number;
  fixture_ticker: string;
  cost: number;
  team_badge: string;
  team_kit: string;
  player_photo: string;
};

type FixtureRow = {
  team_id: number;
  team: string;
  fixtures_in_window: number;
  fixture_score: number;
  avg_difficulty: number | null;
  ticker: string;
};

type Issue = {
  severity: "warning" | "info";
  message: string;
};

type Recommendation = {
  issueMessage: string;
  suggestions: PoolPlayer[];
};

type SwapCandidate = {
  id: number;
  web_name: string;
  team_short: string;
  cost: number;
  predicted_points: number;
  value: number;
};

const POSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];
const POSITION_LIMITS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
// A 15-man squad = a starting XI on the pitch + a 4-man bench. The XI is seeded
// as a 4-4-2 (the neutral default); the bench takes the one-per-position
// overflow (1 GK + 1 DEF + 1 MID + 1 FWD), so pitch + bench sum back to
// POSITION_LIMITS (2/5/5/3). Players fill their position's pitch bucket first.
const PITCH_BUCKET: Record<Position, number> = { GKP: 1, DEF: 4, MID: 4, FWD: 2 };
const MAX_PER_CLUB = 3;
const TOUGH_FIXTURE_THRESHOLD = 3.2; // rough FDR (1-5 scale) worth flagging
const STRONG_FIXTURE_TEAMS_TO_CHECK = 4;
const MAX_SUGGESTIONS = 3;
const MAX_BROWSER_ROWS = 40;
// Below this share of a "nailed" starter's appearance_points (max ~2.0 per
// fixture: p_any + p_60_plus, see team_model.py's _fixture_points), a
// player's own recent minutes history says they're not a safe starter.
const ROTATION_RISK_THRESHOLD = 1.3;
// How many of the position's best-predicted players to treat as "the
// relevant market" when judging whether a squad player's price or output
// is below par - comparing against the full ~140-per-position pool
// (mostly bench fodder that'll never play) would set a bar too low to be
// useful; this narrows it to players actually worth comparing against.
const RELEVANT_POOL_SIZE = 24;
const STATUS_WORDS: Record<string, string> = {
  d: "a doubt", i: "injured", s: "suspended", u: "unavailable", n: "not in the squad",
};

function relevantPoolByPosition(allPlayers: PoolPlayer[]): Record<Position, PoolPlayer[]> {
  const result = {} as Record<Position, PoolPlayer[]>;
  for (const pos of POSITION_ORDER) {
    result[pos] = allPlayers
      .filter((p) => p.position === pos)
      .sort((a, b) => b.predicted_points - a.predicted_points)
      .slice(0, RELEVANT_POOL_SIZE);
  }
  return result;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

function computeDiagnostics(
  squad: PoolPlayer[],
  squadIds: Set<number>,
  fixtures: FixtureRow[],
  allPlayers: PoolPlayer[],
  budgetRemaining: number
): { issues: Issue[]; recommendations: Recommendation[] } {
  const issues: Issue[] = [];
  const recommendations: Recommendation[] = [];
  if (squadIds.size === 0) return { issues, recommendations };

  const neededPositions = POSITION_ORDER.filter(
    (pos) => squad.filter((p) => p.position === pos).length < POSITION_LIMITS[pos]
  );

  function topSuggestions(pool: PoolPlayer[]): PoolPlayer[] {
    let candidates = pool.filter((p) => !squadIds.has(p.id) && p.cost <= budgetRemaining);
    if (neededPositions.length > 0) {
      candidates = candidates.filter((p) => neededPositions.includes(p.position));
    }
    return [...candidates].sort((a, b) => b.predicted_points - a.predicted_points).slice(0, MAX_SUGGESTIONS);
  }

  // Club concentration - 3 is FPL's real max, so hitting it is a correlated-risk warning, not an error.
  const clubCounts = new Map<string, number>();
  for (const p of squad) clubCounts.set(p.team_short, (clubCounts.get(p.team_short) ?? 0) + 1);
  for (const [club, count] of clubCounts) {
    if (count >= MAX_PER_CLUB) {
      issues.push({
        severity: "warning",
        message: `Heavy on ${club} (${count} players) - correlated risk if their fixtures turn.`,
      });
    }
  }

  // Missing exposure to one of the league's best upcoming fixture runs.
  const ownedTeams = new Set(squad.map((p) => p.team_short));
  const sortedFixtures = [...fixtures].sort((a, b) => b.fixture_score - a.fixture_score);
  for (const f of sortedFixtures.slice(0, STRONG_FIXTURE_TEAMS_TO_CHECK)) {
    if (ownedTeams.has(f.team)) continue;
    const message = `No ${f.team} players - they have one of the easier upcoming runs (avg FDR ${f.avg_difficulty}).`;
    issues.push({ severity: "info", message });
    const suggestions = topSuggestions(allPlayers.filter((p) => p.team_short === f.team));
    if (suggestions.length > 0) recommendations.push({ issueMessage: message, suggestions });
  }

  // Tough fixtures among teams you already own.
  for (const club of ownedTeams) {
    const row = fixtures.find((f) => f.team === club);
    if (row && row.avg_difficulty !== null && row.avg_difficulty >= TOUGH_FIXTURE_THRESHOLD) {
      const names = squad.filter((p) => p.team_short === club).map((p) => p.web_name).join(", ");
      issues.push({
        severity: "warning",
        message: `${club} (${names}) face a tough run: ${row.ticker}`,
      });
    }
  }

  // No recognized primary penalty taker.
  if (!squad.some((p) => p.penalties_order === 1)) {
    const message = "No recognized primary penalty taker in your squad - missing a high-value goal source.";
    issues.push({ severity: "warning", message });
    const suggestions = topSuggestions(allPlayers.filter((p) => p.penalties_order === 1));
    if (suggestions.length > 0) recommendations.push({ issueMessage: message, suggestions });
  }

  // No recognized primary direct free-kick taker.
  if (!squad.some((p) => p.direct_freekicks_order === 1)) {
    const message = "No recognized primary free-kick taker - a low-frequency but high-value extra goal source.";
    issues.push({ severity: "info", message });
    const suggestions = topSuggestions(allPlayers.filter((p) => p.direct_freekicks_order === 1));
    if (suggestions.length > 0) recommendations.push({ issueMessage: message, suggestions });
  }

  // No recognized primary corner/indirect free-kick taker.
  if (!squad.some((p) => p.corners_and_indirect_freekicks_order === 1)) {
    const message = "No recognized primary corner-taker - missing a source of assists from set-piece deliveries.";
    issues.push({ severity: "info", message });
    const suggestions = topSuggestions(allPlayers.filter((p) => p.corners_and_indirect_freekicks_order === 1));
    if (suggestions.length > 0) recommendations.push({ issueMessage: message, suggestions });
  }

  // Injured/doubtful/suspended players already in the squad - easy to miss
  // as just a small badge on the row, worth calling out explicitly.
  for (const p of squad) {
    if (p.status && p.status !== "a") {
      const word = STATUS_WORDS[p.status] ?? "flagged";
      const message = `${p.web_name} is ${word}${p.news ? ` (${p.news})` : ""} - consider a replacement while it's unresolved.`;
      issues.push({ severity: "warning", message });
      const suggestions = topSuggestions(allPlayers.filter((alt) => alt.position === p.position && alt.status === "a"));
      if (suggestions.length > 0) recommendations.push({ issueMessage: `Replace ${p.web_name}`, suggestions });
    }
  }

  // Rotation/gametime risk - recent minutes history says less than a nailed start.
  const rotationRisks = squad.filter(
    (p) => p.fixture_count > 0 && p.appearance_points / p.fixture_count < ROTATION_RISK_THRESHOLD
  );
  if (rotationRisks.length > 0) {
    issues.push({
      severity: "info",
      message: `Rotation/gametime risk: ${rotationRisks
        .map((p) => `${p.web_name} (~${((p.appearance_points / p.fixture_count / 2) * 100).toFixed(0)}% of a nailed starter's minutes)`)
        .join(", ")}.`,
    });
  }

  // Value and output vs the relevant market at each position (see
  // RELEVANT_POOL_SIZE) - comparing every squad player against the
  // players actually worth comparing them to, not the whole ~140-deep
  // position pool most of which will never play.
  const relevantPool = relevantPoolByPosition(allPlayers);
  const relevantAvg: Record<Position, { value: number; points: number }> = {} as Record<
    Position,
    { value: number; points: number }
  >;
  for (const pos of POSITION_ORDER) {
    relevantAvg[pos] = {
      value: mean(relevantPool[pos].map((p) => p.value)),
      points: mean(relevantPool[pos].map((p) => p.predicted_points)),
    };
  }

  for (const p of squad) {
    const avg = relevantAvg[p.position];
    if (avg.value > 0 && p.value < avg.value * 0.7) {
      const message = `${p.web_name} returns ${p.value.toFixed(2)} pts/£m, well below the ${p.position} average of ${avg.value.toFixed(
        2
      )} among comparable players - his price isn't earning its keep.`;
      issues.push({ severity: "info", message });
      const suggestions = allPlayers
        .filter((alt) => alt.position === p.position && alt.id !== p.id && !squadIds.has(alt.id) && alt.cost <= p.cost + budgetRemaining)
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_SUGGESTIONS);
      if (suggestions.length > 0) recommendations.push({ issueMessage: message, suggestions });
    }
  }

  for (const pos of POSITION_ORDER) {
    const squadAtPos = squad.filter((p) => p.position === pos);
    if (squadAtPos.length === 0) continue;
    const squadAvgPts = mean(squadAtPos.map((p) => p.predicted_points));
    const avg = relevantAvg[pos];
    if (avg.points > 0 && squadAvgPts < avg.points * 0.75) {
      issues.push({
        severity: "info",
        message: `Your ${pos}s average ${squadAvgPts.toFixed(1)} predicted points this window, well below the ${avg.points.toFixed(
          1
        )} average among the position's top performers - an upgrade here would move the needle most.`,
      });
    }
  }

  return { issues, recommendations };
}

// Greedy completion for "Finish my squad": fills every still-empty slot
// with the highest predicted_points player that's affordable, available
// (status "a"), and legal (not already owned, club count < MAX_PER_CLUB).
// Fills round-robin across positions (one GKP slot, one DEF slot, one MID
// slot, one FWD slot, repeat) rather than exhausting one position before
// the next - exhausting GKP/DEF/MID first tends to blow the budget on
// expensive picks there and strand FWD with only bargain-bin options left.
// "Affordable" also reserves enough of the remaining budget for every
// other still-empty slot (each valued at the cheapest eligible player left
// at that position), so a pick can't spend so much it strands a later one.
// Not a provably optimal squad (see the Optimizer tab for that), just a
// reasonable one-click starting point.
function pickSquadCompletion(
  players: PoolPlayer[],
  squad: PoolPlayer[],
  squadIds: Set<number>,
  budget: number
): { newIds: number[]; skippedPositions: Position[] } {
  const selected = new Set(squadIds);
  const clubCounts = new Map<string, number>();
  for (const p of squad) clubCounts.set(p.team_short, (clubCounts.get(p.team_short) ?? 0) + 1);

  const remainingByPos = {} as Record<Position, number>;
  for (const pos of POSITION_ORDER) {
    remainingByPos[pos] = POSITION_LIMITS[pos] - squad.filter((p) => p.position === pos).length;
  }

  const byPos = {} as Record<Position, PoolPlayer[]>;
  for (const pos of POSITION_ORDER) byPos[pos] = players.filter((p) => p.position === pos);

  function cheapestEligible(pos: Position): number {
    let min = Infinity;
    for (const p of byPos[pos]) {
      if (selected.has(p.id)) continue;
      if ((clubCounts.get(p.team_short) ?? 0) >= MAX_PER_CLUB) continue;
      if (p.cost < min) min = p.cost;
    }
    return Number.isFinite(min) ? min : 4.0; // shouldn't happen; safe floor
  }

  let remainingBudget = budget - squad.reduce((sum, p) => sum + p.cost, 0);
  const newIds: number[] = [];
  const skippedPositions: Position[] = [];
  const failedPositions = new Set<Position>();

  function fillOneSlot(pos: Position): boolean {
    const reserve = POSITION_ORDER.reduce((sum, otherPos) => {
      const count = remainingByPos[otherPos] - (otherPos === pos ? 1 : 0);
      return count > 0 ? sum + count * cheapestEligible(otherPos) : sum;
    }, 0);
    const cap = remainingBudget - reserve;

    const eligible = (p: PoolPlayer) => !selected.has(p.id) && (clubCounts.get(p.team_short) ?? 0) < MAX_PER_CLUB;
    let candidates = byPos[pos].filter((p) => eligible(p) && p.status === "a" && p.cost <= cap + 1e-9);
    if (candidates.length === 0) candidates = byPos[pos].filter((p) => eligible(p) && p.cost <= cap + 1e-9);
    if (candidates.length === 0) candidates = byPos[pos].filter((p) => eligible(p) && p.cost <= remainingBudget + 1e-9);
    if (candidates.length === 0) return false;

    const pick = candidates.reduce((best, p) => (p.predicted_points > best.predicted_points ? p : best));
    selected.add(pick.id);
    newIds.push(pick.id);
    clubCounts.set(pick.team_short, (clubCounts.get(pick.team_short) ?? 0) + 1);
    remainingBudget = Math.round((remainingBudget - pick.cost) * 10) / 10;
    remainingByPos[pos] -= 1;
    return true;
  }

  let madeProgress = true;
  while (madeProgress && POSITION_ORDER.some((pos) => remainingByPos[pos] > 0 && !failedPositions.has(pos))) {
    madeProgress = false;
    for (const pos of POSITION_ORDER) {
      if (remainingByPos[pos] <= 0 || failedPositions.has(pos)) continue;
      if (fillOneSlot(pos)) {
        madeProgress = true;
      } else {
        failedPositions.add(pos);
        skippedPositions.push(pos);
      }
    }
  }

  return { newIds, skippedPositions };
}

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

export function BuildSquadPanel({ onSwitchToOptimize }: { onSwitchToOptimize?: () => void }) {
  const [players, setPlayers] = useState<PoolPlayer[] | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [squadIdList, setSquadIdList] = useState<number[]>([]);
  const [budget, setBudget] = useState(100);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "All">("All");
  const [statsId, setStatsId] = useState<number | null>(null);

  // Auto-save the draft to this device. Restore once on mount (in an effect, not
  // a lazy initializer, so server and first client render match); only start
  // persisting after that so the empty initial state can't clobber a saved draft.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Restore in an effect (not a lazy initializer) so the server/first-client
    // render stays empty and matches - reading localStorage during render would
    // hydration-mismatch.
    const draft = loadSquadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSquadIdList(draft.ids);
    setBudget(draft.budget);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    storeSquadDraft({ ids: squadIdList, budget });
  }, [hydrated, squadIdList, budget]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [playersRes, fixturesRes] = await Promise.all([
          fetch(`${API_URL}/api/squad-builder/players`),
          fetch(`${API_URL}/api/squad-builder/fixtures`),
        ]);
        if (!playersRes.ok) throw new Error(`Players request failed (${playersRes.status})`);
        if (!fixturesRes.ok) throw new Error(`Fixtures request failed (${fixturesRes.status})`);
        setPlayers(await playersRes.json());
        setFixtures(await fixturesRes.json());
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

  const { issues, recommendations } = useMemo(
    () => computeDiagnostics(squad, squadIds, fixtures ?? [], players ?? [], budgetRemaining),
    [squad, squadIds, fixtures, players, budgetRemaining]
  );

  // Split the squad into a starting XI (pitch) and a 4-man bench by add order:
  // the first PITCH_BUCKET[pos] of each position start, the overflow benches.
  // Empty counts drive the placeholder-slot templates in both zones.
  const { pitchPlayers, pitchEmptyByPosition, benchByPosition } = useMemo(() => {
    const byPos: Record<Position, PoolPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] };
    for (const p of squad) byPos[p.position].push(p);

    const toPitchPlayer = (p: PoolPlayer) => ({
      id: p.id,
      name: p.web_name,
      position: p.position,
      teamShort: p.team_short,
      photo: p.player_photo,
      teamKit: p.team_kit,
      subtitle: `${p.predicted_points.toFixed(1)} xPts`,
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
  }, [squad]);

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
  }

  function removePlayer(id: number) {
    setFinishWarning(null);
    setSquadIdList((prev) => prev.filter((existing) => existing !== id));
  }

  const [finishWarning, setFinishWarning] = useState<string | null>(null);

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

  const [swapTargetId, setSwapTargetId] = useState<number | null>(null);
  const [swapOptions, setSwapOptions] = useState<SwapCandidate[] | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  async function loadSwapOptions(player: PoolPlayer) {
    if (swapTargetId === player.id) {
      setSwapTargetId(null);
      setSwapOptions(null);
      return;
    }
    setSwapTargetId(player.id);
    setSwapOptions(null);
    setSwapLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/players/${player.id}/alternatives?limit=5&exclude=${squadIdList.join(",")}`
      );
      if (!res.ok) throw new Error("failed");
      const alts = (await res.json()) as SwapCandidate[];
      setSwapOptions(alts.filter((a) => a.cost <= budgetRemaining + player.cost));
    } catch {
      setSwapOptions([]);
    } finally {
      setSwapLoading(false);
    }
  }

  function swapPlayer(oldId: number, newId: number) {
    setSquadIdList((prev) => prev.map((id) => (id === oldId ? newId : id)));
    setSwapTargetId(null);
    setSwapOptions(null);
  }

  function closeStats() {
    setStatsId(null);
    setSwapTargetId(null);
    setSwapOptions(null);
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
      <p className="mb-6 text-sm text-text-secondary">
        Draft within budget, get live diagnostics, and swap or click into any player.{" "}
        {onSwitchToOptimize && (
          <>
            Or let the solver do it -{" "}
            <button type="button" onClick={onSwitchToOptimize} className="text-pl-purple underline">
              Auto-optimize
            </button>{" "}
            builds a provably-optimal squad for your budget.
          </>
        )}
      </p>

      {loading && <BuildSquadSkeleton />}
      {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

      {players && fixtures && (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-6">
            <TextField
              label="Budget (£m)"
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
            <div className="text-sm text-text-secondary">
              <span className="font-mono font-medium text-text-primary">
                {squadIdList.length}/15
              </span>{" "}
              players &middot; spent{" "}
              <span className="font-mono font-medium text-text-primary">
                £{totalCost.toFixed(1)}m
              </span>{" "}
              &middot; remaining{" "}
              <span className={`font-mono font-medium ${budgetRemaining < 0 ? "text-danger" : "text-text-primary"}`}>
                £{budgetRemaining.toFixed(1)}m
              </span>
            </div>
            <div className="flex gap-3 text-sm text-text-secondary">
              {POSITION_ORDER.map((pos) => (
                <span key={pos} className="font-mono">
                  {pos} {squad.filter((p) => p.position === pos).length}/{POSITION_LIMITS[pos]}
                </span>
              ))}
            </div>
            <Button
              size="sm"
              onClick={finishSquad}
              disabled={squadIdList.length >= 15}
              title={
                squadIdList.length >= 15
                  ? "Squad already full"
                  : "Fill every empty slot with the best affordable available player"
              }
            >
              Finish my squad
            </Button>
          </div>

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
                      <th className="w-8 px-3 py-2.5"></th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Cost</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pred pts</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Value</th>
                      <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Own%</th>
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
                          <td className="px-3 py-2.5">
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
                          <td className="px-3 py-2.5 font-medium text-text-primary">
                            {p.web_name}
                            <StatusBadge status={p.status} news={p.news} />
                          </td>
                          <td className="px-3 py-2.5">
                            <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                          </td>
                          <td className="px-3 py-2.5">
                            <PositionBadge position={p.position} />
                          </td>
                          <td className="px-3 py-2.5 font-mono">£{p.cost.toFixed(1)}m</td>
                          <td className="px-3 py-2.5 font-mono">{p.predicted_points.toFixed(1)}</td>
                          <td className="px-3 py-2.5 font-mono">{p.value.toFixed(2)}</td>
                          <td className="px-3 py-2.5 font-mono">{p.selected_by_percent.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-8">
            {/* Feedback */}
            <div>
              <h2 className="mb-3 font-semibold text-text-primary">
                Feedback
              </h2>
              {squadIdList.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Feedback appears here as you draft your squad.
                </p>
              ) : issues.length === 0 ? (
                <Alert kind="success">No issues found so far - looking balanced.</Alert>
              ) : (
                <ul className="mb-4 space-y-2">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <Alert kind={issue.severity === "warning" ? "warning" : "info"}>{issue.message}</Alert>
                    </li>
                  ))}
                </ul>
              )}

              {recommendations.length > 0 && (
                <div className="space-y-4">
                  {recommendations.map((rec, i) => (
                    <div key={i}>
                      <p className="mb-1 text-xs text-text-muted">{rec.issueMessage}</p>
                      <div className="flex flex-wrap gap-2">
                        {rec.suggestions.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => addPlayer(p.id)}
                            className="rounded-sm border border-border-strong px-2 py-1 text-xs text-text-primary hover:bg-slate-50"
                          >
                            + {p.web_name} ({p.team_short}, £{p.cost.toFixed(1)}m, {p.predicted_points.toFixed(1)} pts)
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Player stats - opened by tapping a player on the pitch. Hosts the
          quick actions that used to live in the removed squad-list table:
          full profile, swap, remove. */}
      {statsPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${statsPlayer.web_name} stats`}
        >
          <div className="absolute inset-0 bg-black/50" onClick={closeStats} aria-hidden="true" />
          <div className="relative z-[1] w-full max-w-md rounded-t-2xl bg-white p-5 shadow-lg sm:rounded-2xl">
            <div className="flex items-start gap-3">
              <PlayerPhoto
                src={statsPlayer.player_photo}
                name={statsPlayer.web_name}
                className="h-14 w-14 shrink-0 rounded-full border border-border bg-surface-sunken object-cover object-top text-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-md font-bold text-pl-purple">{statsPlayer.web_name}</h3>
                  <PositionBadge position={statsPlayer.position} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                  <TeamBadge teamShort={statsPlayer.team_short} name={statsPlayer.team_short} badgeUrl={statsPlayer.team_badge} />
                  <span className="font-mono">£{statsPlayer.cost.toFixed(1)}m</span>
                  <span className="font-mono">{statsPlayer.selected_by_percent.toFixed(1)}% owned</span>
                  <StatusBadge status={statsPlayer.status} news={statsPlayer.news} />
                </div>
              </div>
              <button
                onClick={closeStats}
                aria-label="Close"
                className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-lg text-text-muted hover:bg-surface-sunken hover:text-text-primary"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatTile label="xPts · 5GW" value={statsPlayer.predicted_points.toFixed(1)} />
              <StatTile label="Value" value={statsPlayer.value.toFixed(2)} />
              <StatTile label="Own %" value={`${statsPlayer.selected_by_percent.toFixed(1)}%`} />
            </div>
            {statsPlayer.fixture_ticker && (
              <p className="mt-3 text-xs text-text-muted">
                Next {statsPlayer.fixture_count}:{" "}
                <span className="font-mono text-text-secondary">{statsPlayer.fixture_ticker}</span>
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <PlayerLink
                id={statsPlayer.id}
                className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary hover:bg-slate-50"
              >
                View full profile →
              </PlayerLink>
              <Button size="sm" variant="secondary" onClick={() => loadSwapOptions(statsPlayer)}>
                {swapTargetId === statsPlayer.id ? "Hide replacements" : "Find replacements"}
              </Button>
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
            </div>

            {swapTargetId === statsPlayer.id && (
              <div className="mt-3 border-t border-border pt-3">
                {swapLoading ? (
                  <p className="text-xs text-text-muted">Loading…</p>
                ) : swapOptions && swapOptions.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Swap in
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {swapOptions.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            swapPlayer(statsPlayer.id, a.id);
                            closeStats();
                          }}
                          className="rounded-sm border border-border-strong bg-white px-2 py-1 text-xs text-text-primary hover:bg-slate-50"
                        >
                          {a.web_name} ({a.team_short}, £{a.cost.toFixed(1)}m, {a.predicted_points.toFixed(1)} pts)
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">No affordable alternatives found.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
