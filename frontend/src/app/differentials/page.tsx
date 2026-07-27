"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { TextField } from "@/components/ui/TextField";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { API_URL } from "@/lib/api";

type PlayerScore = {
  id: number;
  live_id: number | null;
  web_name: string;
  team_short: string;
  team_badge: string;
  position: string;
  recommendation_score: number;
  confidence_adjusted: number;
  rotation_risk: number;
  next_opponent: string;
  opponent_multiplier: number;
  form: number;
  ep_next: number;
  expected_minutes: number;
  selected_by_percent: number;
  expected_goal_involvements: number;
  ict_index: number;
  defensive_contribution_per_90: number;
  set_piece_duty_score: number;
  penalties_order: number;
  penalties_missed: number;
};


async function fetchDifferentials(maxOwnership: number, limit: number): Promise<PlayerScore[]> {
  const res = await fetch(
    `${API_URL}/api/players/scores?max_ownership=${maxOwnership}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export default function DifferentialsPage() {
  const [maxOwnership, setMaxOwnership] = useState(10);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<PlayerScore[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(ownership: number, count: number) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDifferentials(ownership, count));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Load once on mount with the default threshold.
  useEffect(() => {
    load(maxOwnership, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    load(maxOwnership, limit);
  }

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Differentials
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Top-scoring, low-ownership players. <SeasonDataNote mode="archived" />
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
          <TextField
            label="Max ownership %"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={maxOwnership}
            onChange={(e) => setMaxOwnership(Number(e.target.value))}
            wrapperClassName="w-28"
          />
          <TextField
            label="Show top"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            wrapperClassName="w-28"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Update"}
          </Button>
        </form>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
        )}

        {data && (
          <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
            <table className="table-cards w-full text-left text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Owned %</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Score</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Next opp</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">EP next</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Form</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Exp. mins</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">xGI</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">ICT</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Def/90</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Set-piece duty</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pens</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="cell-primary px-3 py-2.5 font-medium">
                      <PlayerLink id={p.live_id}>{p.web_name}</PlayerLink>
                    </td>
                    <td data-label="Team" className="px-3 py-2.5">
                      <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                    </td>
                    <td data-label="Pos" className="px-3 py-2.5">
                      <PositionBadge position={p.position} />
                    </td>
                    <td data-label="Owned %" className="px-3 py-2.5 font-mono">{p.selected_by_percent}%</td>
                    <td data-label="Score" className="px-3 py-2.5 font-mono font-medium">{p.recommendation_score.toFixed(3)}</td>
                    <td data-label="Next opp" className="px-3 py-2.5">{p.next_opponent}</td>
                    <td data-label="EP next" className="px-3 py-2.5 font-mono">{p.ep_next}</td>
                    <td data-label="Form" className="px-3 py-2.5 font-mono">{p.form}</td>
                    <td data-label="Exp. mins" className="px-3 py-2.5 font-mono">{p.expected_minutes}</td>
                    <td data-label="xGI" className="px-3 py-2.5 font-mono">{p.expected_goal_involvements}</td>
                    <td data-label="ICT" className="px-3 py-2.5 font-mono">{p.ict_index}</td>
                    <td data-label="Def/90" className="px-3 py-2.5 font-mono">{p.defensive_contribution_per_90}</td>
                    <td data-label="Set-piece duty" className="px-3 py-2.5 font-mono">{p.set_piece_duty_score.toFixed(2)}</td>
                    <td data-label="Pens" className="px-3 py-2.5 font-mono">
                      {p.penalties_order === 1
                        ? "1st"
                        : p.penalties_order === 2
                        ? "2nd"
                        : "-"}
                      {p.penalties_missed > 0 ? ` (${p.penalties_missed} missed)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
