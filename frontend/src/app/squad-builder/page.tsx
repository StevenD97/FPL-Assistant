"use client";

import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Position = "GKP" | "DEF" | "MID" | "FWD";

type PoolPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: Position;
  predicted_points: number;
  penalties_order: number;
  fixture_ticker: string;
  cost: number;
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

const POSITION_ORDER: Position[] = ["GKP", "DEF", "MID", "FWD"];
const POSITION_LIMITS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 };
const MAX_PER_CLUB = 3;
const TOUGH_FIXTURE_THRESHOLD = 3.2; // rough FDR (1-5 scale) worth flagging
const STRONG_FIXTURE_TEAMS_TO_CHECK = 4;
const MAX_SUGGESTIONS = 3;
const MAX_BROWSER_ROWS = 40;

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

  return { issues, recommendations };
}

export default function SquadBuilderPage() {
  const [players, setPlayers] = useState<PoolPlayer[] | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [squadIdList, setSquadIdList] = useState<number[]>([]);
  const [budget, setBudget] = useState(100);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "All">("All");

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
    setSquadIdList((prev) => [...prev, id]);
  }

  function removePlayer(id: number) {
    setSquadIdList((prev) => prev.filter((existing) => existing !== id));
  }

  const filteredPlayers = useMemo(() => {
    if (!players) return [];
    let pool = players;
    if (positionFilter !== "All") pool = pool.filter((p) => p.position === positionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) => p.web_name.toLowerCase().includes(q) || p.team_short.toLowerCase().includes(q));
    }
    return pool.slice(0, MAX_BROWSER_ROWS);
  }, [players, positionFilter, search]);

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          Squad Builder
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Draft your own squad within budget and get live feedback below - club
          concentration, missing exposure to good fixture runs, tough fixtures
          among your own players, and set-piece coverage - each with concrete
          players to fix it. For a fully automated build instead, see{" "}
          <a href="/optimizer" className="underline">
            Optimizer
          </a>
          .
        </p>

        {loading && <p className="text-zinc-500">Loading player data...</p>}
        {error && <p className="mb-4 text-red-600">{error}</p>}

        {players && fixtures && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-6">
              <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
                Budget (£m)
                <input
                  type="number"
                  min={80}
                  max={120}
                  step={0.5}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="mt-1 w-28 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-black dark:text-zinc-50">
                  {squadIdList.length}/15
                </span>{" "}
                players &middot; spent{" "}
                <span className="font-medium text-black dark:text-zinc-50">
                  £{totalCost.toFixed(1)}m
                </span>{" "}
                &middot; remaining{" "}
                <span className={`font-medium ${budgetRemaining < 0 ? "text-red-600" : "text-black dark:text-zinc-50"}`}>
                  £{budgetRemaining.toFixed(1)}m
                </span>
              </div>
              <div className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                {POSITION_ORDER.map((pos) => (
                  <span key={pos}>
                    {pos} {squad.filter((p) => p.position === pos).length}/{POSITION_LIMITS[pos]}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Player browser */}
              <div>
                <h2 className="mb-3 font-semibold text-black dark:text-zinc-50">
                  Players
                </h2>
                <div className="mb-3 flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or team..."
                    className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value as Position | "All")}
                    className="rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {["All", ...POSITION_ORDER].map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-900">
                      <tr>
                        <th className="px-3 py-2">Player</th>
                        <th className="px-3 py-2">Team</th>
                        <th className="px-3 py-2">Pos</th>
                        <th className="px-3 py-2">Cost</th>
                        <th className="px-3 py-2">Pred pts</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((p) => {
                        const { ok, reason } = canAdd(p);
                        return (
                          <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                            <td className="px-3 py-2 font-medium">{p.web_name}</td>
                            <td className="px-3 py-2">{p.team_short}</td>
                            <td className="px-3 py-2">{p.position}</td>
                            <td className="px-3 py-2">£{p.cost.toFixed(1)}m</td>
                            <td className="px-3 py-2">{p.predicted_points.toFixed(1)}</td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => addPlayer(p.id)}
                                disabled={!ok}
                                title={reason}
                                className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-30 dark:bg-white dark:text-black"
                              >
                                Add
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Draft squad + diagnostics */}
              <div>
                <h2 className="mb-3 font-semibold text-black dark:text-zinc-50">
                  Your squad
                </h2>
                <div className="mb-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {squadIdList.length === 0 ? (
                    <p className="p-4 text-sm text-zinc-500">
                      No players yet - add some from the list on the left.
                    </p>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-100 dark:bg-zinc-900">
                        <tr>
                          <th className="px-3 py-2">Player</th>
                          <th className="px-3 py-2">Team</th>
                          <th className="px-3 py-2">Pos</th>
                          <th className="px-3 py-2">Cost</th>
                          <th className="px-3 py-2">Pred pts</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {POSITION_ORDER.flatMap((pos) =>
                          squad
                            .filter((p) => p.position === pos)
                            .map((p) => (
                              <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                                <td className="px-3 py-2 font-medium">{p.web_name}</td>
                                <td className="px-3 py-2">{p.team_short}</td>
                                <td className="px-3 py-2">{p.position}</td>
                                <td className="px-3 py-2">£{p.cost.toFixed(1)}m</td>
                                <td className="px-3 py-2">{p.predicted_points.toFixed(1)}</td>
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => removePlayer(p.id)}
                                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>

                <h2 className="mb-3 font-semibold text-black dark:text-zinc-50">
                  Feedback
                </h2>
                {squadIdList.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Feedback appears here as you draft your squad.
                  </p>
                ) : issues.length === 0 ? (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    No issues found so far - looking balanced.
                  </p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {issues.map((issue, i) => (
                      <li
                        key={i}
                        className={`rounded border px-3 py-2 text-sm ${
                          issue.severity === "warning"
                            ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
                        }`}
                      >
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}

                {recommendations.length > 0 && (
                  <div className="space-y-4">
                    {recommendations.map((rec, i) => (
                      <div key={i}>
                        <p className="mb-1 text-xs text-zinc-500">{rec.issueMessage}</p>
                        <div className="flex flex-wrap gap-2">
                          {rec.suggestions.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => addPlayer(p.id)}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
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
      </div>
    </main>
  );
}
