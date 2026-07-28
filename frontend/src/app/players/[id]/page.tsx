"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CompareArrow } from "@/shared/ui/CompareArrow";
import { PlayerCard } from "@/features/players/PlayerCard";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { StatTile } from "@/shared/ui/Card";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { TextField } from "@/shared/ui/TextField";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { FdrChip } from "@/shared/ui/FdrChip";
import { LineChart } from "@/shared/charts/LineChart";
import { Skeleton } from "@/shared/ui/Skeleton";
import { seriesColor } from "@/shared/lib/palette";
import { linearTrend } from "@/shared/lib/trend";
import { API_URL } from "@/shared/lib/api";

const MAX_COMPARE = 4;

type SeasonStats = {
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  saves: number;
  bonus: number;
  minutes: number;
  starts: number;
  yellow_cards: number;
  red_cards: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  ict_index: string;
};

type GwRow = { GW: number; total_points: number; minutes: number; goals_scored: number; assists: number; bonus: number };

type Prediction = {
  predicted_points: number;
  predicted_goals: number;
  predicted_assists: number;
  clean_sheet_prob: number;
  goal_points: number;
  assist_points: number;
  clean_sheet_points: number;
  bonus_points: number;
  defensive_contribution_points: number;
  fixture_count: number;
};

type PlayerDetail = {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team_short: string;
  team_name: string;
  position: string;
  cost: number;
  selected_by_percent: number;
  status: string;
  news: string;
  penalties_order: number;
  team_badge: string;
  team_kit: string;
  player_photo: string;
  season_stats: SeasonStats | null;
  gw_history: GwRow[];
  prediction: Prediction | null;
  fixtures: { opponent: string; is_home: boolean; difficulty: number; opponent_badge: string }[];
};

type PlayerSummary = { id: number; web_name: string; team_short: string; position: string };

type CompareRow = {
  label: string;
  get: (p: PlayerDetail) => number | null;
  format?: (n: number) => string;
};

const PREDICTION_ROWS: CompareRow[] = [
  { label: "Predicted points", get: (p) => p.prediction?.predicted_points ?? null, format: (n) => n.toFixed(1) },
  { label: "Predicted goals", get: (p) => p.prediction?.predicted_goals ?? null, format: (n) => n.toFixed(2) },
  { label: "Predicted assists", get: (p) => p.prediction?.predicted_assists ?? null, format: (n) => n.toFixed(2) },
  {
    label: "Clean sheet prob",
    get: (p) => (p.prediction ? p.prediction.clean_sheet_prob * 100 : null),
    format: (n) => `${n.toFixed(0)}%`,
  },
];

const SEASON_ROWS: CompareRow[] = [
  { label: "Total points", get: (p) => p.season_stats?.total_points ?? null },
  { label: "Goals", get: (p) => p.season_stats?.goals_scored ?? null },
  { label: "Assists", get: (p) => p.season_stats?.assists ?? null },
  { label: "Clean sheets", get: (p) => p.season_stats?.clean_sheets ?? null },
  { label: "Minutes", get: (p) => p.season_stats?.minutes ?? null },
  { label: "Bonus", get: (p) => p.season_stats?.bonus ?? null },
  { label: "ICT index", get: (p) => (p.season_stats ? Number(p.season_stats.ict_index) : null), format: (n) => n.toFixed(1) },
  {
    label: "xGI",
    get: (p) => (p.season_stats ? Number(p.season_stats.expected_goal_involvements) : null),
    format: (n) => n.toFixed(2),
  },
];

function CompareTable({ title, rows, players }: { title: string; rows: CompareRow[]; players: PlayerDetail[] }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-lg border border-border shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</th>
            {players.map((p) => (
              <th key={p.id} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                {p.web_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const baseline = row.get(players[0]);
            return (
              <tr key={row.label} className="border-t border-border">
                <td className="px-3 py-2.5 text-text-secondary">{row.label}</td>
                {players.map((p, i) => {
                  const value = row.get(p);
                  return (
                    <td key={p.id} className="px-3 py-2.5 font-mono">
                      {value === null ? (
                        "-"
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {row.format ? row.format(value) : value}
                          {i > 0 && baseline !== null && <CompareArrow value={value} baseline={baseline} />}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Mirrors the detail header: the FIFA-style card on the left, the name/meta
// block and the prediction stat-tile grid on the right, then the chart panel -
// so the page's shape is stable before the data lands.
function PlayerDetailSkeleton() {
  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start">
          <Skeleton className="h-[352px] w-full max-w-[248px] shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-52" />
              <Skeleton className="h-5 w-12 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="mt-5">
              <Skeleton className="mb-2 h-4 w-64" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            </div>
          </div>
        </div>
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="mt-8 h-56 w-full rounded-lg" />
      </div>
    </main>
  );
}

// Big headline tile for the hero - larger than the StatTile used lower down,
// so the key predictions read as the focal point around the card.
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white px-3 py-4 text-center shadow-sm">
      <span className="font-mono text-2xl font-bold text-pl-purple">{value}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
    </div>
  );
}

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allPlayers, setAllPlayers] = useState<PlayerSummary[] | null>(null);
  const [compareList, setCompareList] = useState<PlayerDetail[]>([]);
  const [compareSearch, setCompareSearch] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setCompareList([]);
      setCompareSearch("");
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/players/${id}`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadAll() {
      try {
        const res = await fetch(`${API_URL}/api/players`);
        if (!res.ok) return;
        setAllPlayers(await res.json());
      } catch {
        // Compare-player search just won't offer suggestions - not fatal.
      }
    }
    loadAll();
  }, []);

  const compareIds = useMemo(() => new Set(compareList.map((p) => p.id)), [compareList]);

  const suggestions = useMemo(() => {
    if (!allPlayers || !compareSearch.trim()) return [];
    const q = compareSearch.trim().toLowerCase();
    return allPlayers
      .filter((p) => p.id !== data?.id && !compareIds.has(p.id))
      .filter((p) => p.web_name.toLowerCase().includes(q) || p.team_short.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allPlayers, compareSearch, compareIds, data]);

  async function addCompare(playerId: number) {
    if (compareList.length >= MAX_COMPARE) return;
    setAddLoading(true);
    setCompareSearch("");
    try {
      const res = await fetch(`${API_URL}/api/players/${playerId}`);
      if (!res.ok) throw new Error("failed");
      const detail: PlayerDetail = await res.json();
      setCompareList((prev) => [...prev, detail]);
    } catch {
      // Silently drop - the search box just stays available to retry.
    } finally {
      setAddLoading(false);
    }
  }

  function removeCompare(playerId: number) {
    setCompareList((prev) => prev.filter((p) => p.id !== playerId));
  }

  if (loading) return <PlayerDetailSkeleton />;
  if (error || !data) return <main className="px-4 py-5 lg:px-6 lg:py-6"><p className="mx-auto max-w-6xl text-sm font-medium text-danger">{error ?? "Player not found"}</p></main>;

  const p = data;
  const comparing = compareList.length > 0;
  const allSelected = [p, ...compareList];

  const chartSeries = comparing
    ? allSelected.map((player, i) => ({
        label: player.web_name,
        // seriesColor(0) is pl-purple, the same hardcoded color as the
        // primary player below - start compare players at seriesColor(i)
        // (not i-1) so the first one never collides with it.
        color: i === 0 ? "#37003c" : seriesColor(i),
        points: player.gw_history.map((row) => ({ x: row.GW, y: row.total_points })),
      }))
    : [
        { label: p.web_name, color: "#37003c", points: p.gw_history.map((row) => ({ x: row.GW, y: row.total_points })) },
        {
          label: "Trend",
          color: "#71717f",
          dashed: true,
          points: linearTrend(p.gw_history.map((row) => ({ x: row.GW, y: row.total_points }))),
        },
      ];

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-6xl">
        {/* Grandiose hero: the card centered, key predictions fanned around it,
            identity + meta beneath. Everything else lives below the fold. */}
        <section className="mb-10">
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-center lg:gap-8">
            {p.prediction && (
              <div className="order-2 grid w-full max-w-xs grid-cols-2 gap-3 lg:order-1 lg:w-52">
                <HeroStat label="Predicted points" value={p.prediction.predicted_points.toFixed(1)} />
                <HeroStat label="Predicted goals" value={p.prediction.predicted_goals.toFixed(2)} />
              </div>
            )}

            <div className="order-1 lg:order-2">
              <PlayerCard
                size="hero"
                name={p.web_name}
                position={p.position}
                teamShort={p.team_short}
                teamBadge={p.team_badge}
                photo={p.player_photo}
                rating={p.prediction ? p.prediction.predicted_points.toFixed(1) : "—"}
                windowLabel={p.prediction ? `${p.prediction.fixture_count} GW` : undefined}
                stats={[
                  { k: "PTS", v: p.season_stats ? String(p.season_stats.total_points) : "—" },
                  { k: "GLS", v: p.season_stats ? String(p.season_stats.goals_scored) : "—" },
                  { k: "AST", v: p.season_stats ? String(p.season_stats.assists) : "—" },
                  { k: "xGI", v: p.season_stats ? Number(p.season_stats.expected_goal_involvements).toFixed(1) : "—" },
                  { k: "ICT", v: p.season_stats ? Number(p.season_stats.ict_index).toFixed(0) : "—" },
                  { k: "MIN", v: p.season_stats ? String(p.season_stats.minutes) : "—" },
                ]}
              />
            </div>

            {p.prediction && (
              <div className="order-3 grid w-full max-w-xs grid-cols-2 gap-3 lg:w-52">
                <HeroStat label="Predicted assists" value={p.prediction.predicted_assists.toFixed(2)} />
                <HeroStat label="Clean sheet prob" value={`${(p.prediction.clean_sheet_prob * 100).toFixed(0)}%`} />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <h1 className="font-sans text-2xl font-bold tracking-tight text-pl-purple">
                {p.first_name} {p.second_name}
              </h1>
              <PositionBadge position={p.position} />
              <StatusBadge status={p.status} news={p.news} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-text-secondary">
              <TeamBadge teamShort={p.team_short} name={p.team_name} badgeUrl={p.team_badge} />
              <span className="font-mono">£{p.cost.toFixed(1)}m</span>
              <span className="font-mono">{p.selected_by_percent.toFixed(1)}% owned</span>
              {p.penalties_order === 1 && <span>Primary penalty taker</span>}
            </div>
            {p.fixtures.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="text-sm text-text-muted">Next {p.prediction?.fixture_count ?? p.fixtures.length} gameweeks</span>
                {p.fixtures.map((fx, i) => (
                  <FdrChip
                    key={i}
                    opponent={fx.opponent}
                    isHome={fx.is_home}
                    difficulty={fx.difficulty}
                    badgeUrl={fx.opponent_badge}
                  />
                ))}
              </div>
            )}
            {p.news && (
              <p className="mt-1 max-w-lg rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{p.news}</p>
            )}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-text-primary">Compare</h2>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TextField
              value={compareSearch}
              onChange={(e) => setCompareSearch(e.target.value)}
              placeholder={compareList.length >= MAX_COMPARE ? `Up to ${MAX_COMPARE} at a time` : "Add a player to compare..."}
              wrapperClassName="w-64"
              disabled={compareList.length >= MAX_COMPARE || addLoading}
            />
            {compareList.map((cp) => (
              <span
                key={cp.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong px-2 py-1 text-xs text-text-primary"
              >
                {cp.web_name}
                <button onClick={() => removeCompare(cp.id)} className="text-text-muted hover:text-danger" aria-label={`Remove ${cp.web_name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addCompare(s.id)}
                  className="rounded-sm border border-border-strong px-2 py-1 text-xs text-text-primary hover:bg-slate-50"
                >
                  + {s.web_name} ({s.team_short}, {s.position})
                </button>
              ))}
            </div>
          )}
        </section>

        {comparing ? (
          <>
            <CompareTable
              title={p.prediction ? `Next ${p.prediction.fixture_count} gameweeks` : "Next gameweeks"}
              rows={PREDICTION_ROWS}
              players={allSelected}
            />
            <CompareTable title="2025/26 season" rows={SEASON_ROWS} players={allSelected} />
          </>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="mb-3 font-semibold text-text-primary">2025/26 season</h2>
              {/* Points/goals/assists/xGI/ICT/minutes already headline the card above -
                  everything here is the rest of the season record, not a repeat of it. */}
              {p.season_stats ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatTile label="Clean sheets" value={p.season_stats.clean_sheets} />
                  <StatTile label="Bonus" value={p.season_stats.bonus} />
                  <StatTile label="Starts" value={p.season_stats.starts} />
                  <StatTile label="xG" value={Number(p.season_stats.expected_goals).toFixed(1)} />
                  <StatTile label="xA" value={Number(p.season_stats.expected_assists).toFixed(1)} />
                  <StatTile label="Goals conceded" value={p.season_stats.goals_conceded} />
                  <StatTile label="Saves" value={p.season_stats.saves} />
                  <StatTile label="Cards" value={`${p.season_stats.yellow_cards}Y / ${p.season_stats.red_cards}R`} />
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  No 2025/26 Premier League record - new to the top flight this season.
                </p>
              )}
            </section>
          </>
        )}

        {chartSeries.some((s) => s.points.length > 0) && (
          <section>
            <h2 className="mb-3 font-semibold text-text-primary">Points by gameweek, 2025/26</h2>
            <LineChart series={chartSeries} />
          </section>
        )}
      </div>
    </main>
  );
}
