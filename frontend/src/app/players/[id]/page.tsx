"use client";

import { use, useEffect, useState } from "react";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { StatTile } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { LineChart } from "@/components/charts/LineChart";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  fixture_ticker: string;
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
  season_stats: SeasonStats | null;
  gw_history: GwRow[];
  prediction: Prediction | null;
};

export default function PlayerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PlayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
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

  if (loading) return <main className="min-h-screen bg-white p-8"><p className="mx-auto max-w-4xl text-text-muted">Loading...</p></main>;
  if (error || !data) return <main className="min-h-screen bg-white p-8"><p className="mx-auto max-w-4xl text-sm font-medium text-danger">{error ?? "Player not found"}</p></main>;

  const p = data;

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-sans text-2xl font-bold text-pl-purple">
            {p.first_name} {p.second_name}
          </h1>
          <PositionBadge position={p.position} />
          <StatusBadge status={p.status} news={p.news} />
        </div>
        <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
          <TeamBadge teamShort={p.team_short} name={p.team_name} />
          <span className="font-mono">£{p.cost.toFixed(1)}m</span>
          <span className="font-mono">{p.selected_by_percent.toFixed(1)}% owned</span>
          {p.penalties_order === 1 && <span>Primary penalty taker</span>}
        </div>

        {p.prediction && (
          <section className="mb-8">
            <h2 className="mb-3 font-semibold text-text-primary">
              Next {p.prediction.fixture_count} gameweeks
            </h2>
            <p className="mb-3 text-sm text-text-secondary">{p.prediction.fixture_ticker}</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Predicted points" value={p.prediction.predicted_points.toFixed(1)} />
              <StatTile label="Predicted goals" value={p.prediction.predicted_goals.toFixed(2)} />
              <StatTile label="Predicted assists" value={p.prediction.predicted_assists.toFixed(2)} />
              <StatTile label="Clean sheet prob" value={`${(p.prediction.clean_sheet_prob * 100).toFixed(0)}%`} />
            </div>
          </section>
        )}

        <section className="mb-8">
          <h2 className="mb-3 font-semibold text-text-primary">2025/26 season</h2>
          {p.season_stats ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatTile label="Total points" value={p.season_stats.total_points} />
              <StatTile label="Goals" value={p.season_stats.goals_scored} />
              <StatTile label="Assists" value={p.season_stats.assists} />
              <StatTile label="Clean sheets" value={p.season_stats.clean_sheets} />
              <StatTile label="Minutes" value={p.season_stats.minutes} />
              <StatTile label="Bonus" value={p.season_stats.bonus} />
              <StatTile label="ICT index" value={p.season_stats.ict_index} />
              <StatTile label="xGI" value={p.season_stats.expected_goal_involvements} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No 2025/26 Premier League record - new to the top flight this season.
            </p>
          )}
        </section>

        {p.gw_history.length > 0 && (
          <section>
            <h2 className="mb-3 font-semibold text-text-primary">Points by gameweek, 2025/26</h2>
            <LineChart
              series={[{
                label: p.web_name,
                color: "#37003c",
                points: p.gw_history.map((row) => ({ x: row.GW, y: row.total_points })),
              }]}
              showLegend={false}
            />
          </section>
        )}
      </div>
    </main>
  );
}
