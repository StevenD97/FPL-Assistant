"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CompareArrow } from "@/shared/ui/CompareArrow";
import { StatTile } from "@/shared/ui/Card";
import { TableFrame, Th } from "@/shared/ui/Table";
import { PlayerCard } from "@/shared/ui/PlayerCard";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { TextField } from "@/shared/ui/TextField";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { FdrChip } from "@/shared/ui/FdrChip";
import { LineChart } from "@/shared/charts/LineChart";
import { Skeleton } from "@/shared/ui/Skeleton";
import { ShortlistStar } from "@/shared/ui/ShortlistStar";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { seriesColor } from "@/shared/lib/palette";
import { linearTrend } from "@/shared/lib/trend";
import { apiGet } from "@/shared/lib/api";
import type { PlayerDetail, PlayerListItem } from "@/shared/types/api";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";
import { WhyNot } from "@/features/players/WhyNot";

const MAX_COMPARE = 4;

// Only the four fields the compare-player autocomplete reads, tied to the
// generated list contract so a rename upstream is a compile error here.
type PlayerSummary = Pick<PlayerListItem, "id" | "web_name" | "team_short" | "position">;

type CompareRow = {
  label: string;
  tooltip?: StatGlossaryKey;
  get: (p: PlayerDetail) => number | null;
  format?: (n: number) => string;
};

const PREDICTION_ROWS: CompareRow[] = [
  {
    label: "Predicted points",
    tooltip: "predictedPoints",
    get: (p) => p.prediction?.predicted_points ?? null,
    format: (n) => n.toFixed(1),
  },
  {
    label: "Predicted goals",
    tooltip: "predictedGoals",
    get: (p) => p.prediction?.predicted_goals ?? null,
    format: (n) => n.toFixed(2),
  },
  {
    label: "Predicted assists",
    tooltip: "predictedAssists",
    get: (p) => p.prediction?.predicted_assists ?? null,
    format: (n) => n.toFixed(2),
  },
  {
    label: "Clean sheet prob",
    tooltip: "cleanSheetProb",
    get: (p) => (p.prediction ? p.prediction.clean_sheet_prob * 100 : null),
    format: (n) => `${n.toFixed(0)}%`,
  },
];

const SEASON_ROWS: CompareRow[] = [
  { label: "Total points", tooltip: "totalPts", get: (p) => p.season_stats?.total_points ?? null },
  { label: "Goals", tooltip: "goals", get: (p) => p.season_stats?.goals_scored ?? null },
  { label: "Assists", tooltip: "assists", get: (p) => p.season_stats?.assists ?? null },
  { label: "Clean sheets", tooltip: "cleanSheets", get: (p) => p.season_stats?.clean_sheets ?? null },
  { label: "Minutes", tooltip: "minutes", get: (p) => p.season_stats?.minutes ?? null },
  { label: "Bonus", tooltip: "bonus", get: (p) => p.season_stats?.bonus ?? null },
  {
    label: "ICT index",
    tooltip: "ictIndex",
    get: (p) => (p.season_stats ? Number(p.season_stats.ict_index) : null),
    format: (n) => n.toFixed(1),
  },
  {
    label: "xGI",
    tooltip: "xgi",
    get: (p) => (p.season_stats ? Number(p.season_stats.expected_goal_involvements) : null),
    format: (n) => n.toFixed(2),
  },
];

// Shared with the compare-mode card row, so both places show the same six
// stats on the card front.
function cardStats(player: PlayerDetail): { k: string; v: string; tooltip: StatGlossaryKey }[] {
  const s = player.season_stats;
  return [
    { k: "PTS", v: s ? String(s.total_points) : "—", tooltip: "totalPts" },
    { k: "GLS", v: s ? String(s.goals_scored) : "—", tooltip: "goals" },
    { k: "AST", v: s ? String(s.assists) : "—", tooltip: "assists" },
    { k: "xGI", v: s ? Number(s.expected_goal_involvements).toFixed(1) : "—", tooltip: "xgi" },
    { k: "ICT", v: s ? Number(s.ict_index).toFixed(0) : "—", tooltip: "ictIndex" },
    { k: "MIN", v: s ? String(s.minutes) : "—", tooltip: "minutes" },
  ];
}

function CompareTable({ title, rows, players }: { title: string; rows: CompareRow[]; players: PlayerDetail[] }) {
  return (
    <div className="mb-6">
      {/* The title lives above the table, not in the header row: `table-cards`
          hides the thead on mobile, and this table is transposed (stats down,
          players across) so each row becomes a card headed by the stat with one
          labelled line per player - which needs the player names as data-labels. */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <TableFrame>
        <thead className="bg-surface-sunken">
          <tr>
            <Th>
              <span className="sr-only">Stat</span>
            </Th>
            {players.map((p) => (
              <Th key={p.id}>{p.web_name}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const baseline = row.get(players[0]);
            return (
              <tr key={row.label} className="border-t border-border">
                <td className="cell-primary px-3 py-2.5 text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    {row.label}
                    {row.tooltip && <InfoTooltip term={row.tooltip} />}
                  </span>
                </td>
                {players.map((p, i) => {
                  const value = row.get(p);
                  return (
                    <td key={p.id} data-label={p.web_name} className="px-3 py-2.5 font-mono">
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
      </TableFrame>
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
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </main>
  );
}

/**
 * The per-90 rates behind the totals, collapsed by default.
 *
 * Two things the feedback asked for at once: stat-focused readers want the
 * underlying numbers, and nobody wants them cluttering the default view. So the
 * hero card keeps its six headline figures and this sits below it, shut, costing
 * one line until someone asks for it.
 *
 * Rates rather than totals is the point: a 20-minute substitute with a good
 * xG/90 is a different player from one with the same season xG over 3000 minutes,
 * and the totals above can't tell them apart.
 */
function UnderlyingStats({ stats }: { stats: NonNullable<PlayerDetail["season_stats"]> }) {
  const [open, setOpen] = useState(false);

  // FPL sends the per-90s as numbers but `threat` as a string; Number() over both
  // keeps one code path and copes if that ever changes.
  const rows: { label: string; value: string; tooltip: StatGlossaryKey }[] = [
    { label: "xG / 90", value: Number(stats.expected_goals_per_90).toFixed(2), tooltip: "xg90" },
    { label: "xA / 90", value: Number(stats.expected_assists_per_90).toFixed(2), tooltip: "xa90" },
    { label: "xGI / 90", value: Number(stats.expected_goal_involvements_per_90).toFixed(2), tooltip: "xgi90" },
    { label: "xGC / 90", value: Number(stats.expected_goals_conceded_per_90).toFixed(2), tooltip: "xgc90" },
    { label: "Def / 90", value: Number(stats.defensive_contribution_per_90).toFixed(2), tooltip: "def90" },
    { label: "Starts / 90", value: Number(stats.starts_per_90).toFixed(2), tooltip: "starts90" },
    { label: "Threat", value: Number(stats.threat).toFixed(0), tooltip: "threat" },
  ];

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 font-semibold text-text-primary hover:text-pl-purple"
      >
        <span aria-hidden="true" className={`text-text-muted transition-transform ${open ? "rotate-90" : ""}`}>
          ▸
        </span>
        Underlying numbers
        <span className="text-xs font-normal text-text-muted">per 90 minutes</span>
      </button>

      {open && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {rows.map((r) => (
              <StatTile key={r.label} label={r.label} value={r.value} tooltip={r.tooltip} />
            ))}
          </div>
          {/* Stated rather than left to be discovered: someone reading per-90s is
              exactly the reader who will go looking for shots and xG/shot. */}
          <p className="mt-2 text-xs text-text-muted">
            From last season&apos;s completed data. FPL publishes no shot counts, so shots/90 and xG/shot
            aren&apos;t available here - Threat is the nearest read on shot volume.
          </p>
        </>
      )}
    </section>
  );
}

// Big headline tile for the hero - larger than the StatTile used lower down,
// so the key predictions read as the focal point around the card.
function HeroStat({ label, value, tooltip }: { label: string; value: string; tooltip?: StatGlossaryKey }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-white px-3 py-4 text-center shadow-sm">
      <span className="font-mono text-2xl font-bold text-pl-purple">{value}</span>
      <span className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
        {tooltip && <InfoTooltip term={tooltip} />}
      </span>
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
        setData(await apiGet<PlayerDetail>(`/api/players/${id}`));
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
        setAllPlayers(await apiGet<PlayerSummary[]>("/api/players"));
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
      const detail = await apiGet<PlayerDetail>(`/api/players/${playerId}`);
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
                <HeroStat label="Predicted points" value={p.prediction.predicted_points.toFixed(1)} tooltip="predictedPoints" />
                <HeroStat label="Predicted goals" value={p.prediction.predicted_goals.toFixed(2)} tooltip="predictedGoals" />
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
                stats={cardStats(p)}
              />
            </div>

            {p.prediction && (
              <div className="order-3 grid w-full max-w-xs grid-cols-2 gap-3 lg:w-52">
                <HeroStat label="Predicted assists" value={p.prediction.predicted_assists.toFixed(2)} tooltip="predictedAssists" />
                <HeroStat
                  label="Clean sheet prob"
                  value={`${(p.prediction.clean_sheet_prob * 100).toFixed(0)}%`}
                  tooltip="cleanSheetProb"
                />
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
              <ShortlistStar id={p.id} className="text-2xl" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-text-secondary">
              <TeamBadge teamShort={p.team_short} name={p.team_name} badgeUrl={p.team_badge} />
              <span className="font-mono">£{p.cost.toFixed(1)}m</span>
              <span className="inline-flex items-center gap-1 font-mono">
                {p.selected_by_percent.toFixed(1)}% owned
                <InfoTooltip term="ownership" />
              </span>
              {p.penalties_order === 1 && <span>Primary penalty taker</span>}
            </div>
            {p.fixtures.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-sm text-text-muted">
                  Next {p.prediction?.fixture_count ?? p.fixtures.length} gameweeks
                  <InfoTooltip term="fdr" />
                </span>
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

        {/* The answer to the question the reader arrived with. Directly under
            the hero, because "should I buy him?" is why they opened this page
            at all - not something to find after the stat tables. */}
        <div className="mb-8">
          <WhyNot playerId={p.id} />
        </div>

        {p.season_stats && <UnderlyingStats stats={p.season_stats} />}

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

        {comparing && (
          <section className="mb-8 flex flex-wrap items-start justify-center gap-4">
            {allSelected.map((player) => (
              <PlayerCard
                key={player.id}
                name={player.web_name}
                position={player.position}
                teamShort={player.team_short}
                teamBadge={player.team_badge}
                photo={player.player_photo}
                rating={player.prediction ? player.prediction.predicted_points.toFixed(1) : "—"}
                windowLabel={player.prediction ? `${player.prediction.fixture_count} GW` : undefined}
                stats={cardStats(player)}
              />
            ))}
          </section>
        )}

        {comparing && (
          <>
            <CompareTable
              title={p.prediction ? `Next ${p.prediction.fixture_count} gameweeks` : "Next gameweeks"}
              rows={PREDICTION_ROWS}
              players={allSelected}
            />
            <CompareTable title="2025/26 season" rows={SEASON_ROWS} players={allSelected} />
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
