"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { LineChart } from "@/components/charts/LineChart";
import { seriesColor } from "@/lib/palette";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type League = { id: number; name: string; entry_rank: number };

type StandingRow = {
  entry_id: number;
  player_name: string;
  entry_name: string;
  rank: number;
  last_rank: number;
  total: number;
  event_total: number;
};

type TrendEntry = {
  entry_id: number;
  player_name: string;
  entry_name: string;
  series: { event: number; total_points: number }[];
};

type StandingsResponse = { league_name: string; standings: StandingRow[]; trend: TrendEntry[] };

export default function LeaguesPage() {
  const [teamId, setTeamId] = useState("");
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFindLeagues(e: FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setLoading(true);
    setError(null);
    setLeagues(null);
    setStandings(null);
    try {
      const res = await fetch(`${API_URL}/api/leagues/${teamId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setLeagues(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function loadStandings(leagueId: number) {
    setSelectedLeague(leagueId);
    setStandingsLoading(true);
    setStandings(null);
    try {
      const res = await fetch(`${API_URL}/api/leagues/${leagueId}/standings`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setStandings(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStandingsLoading(false);
    }
  }

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Leagues
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Standings and gameweek-by-gameweek score trends for your mini-leagues.
        </p>

        <form onSubmit={handleFindLeagues} className="mb-6 flex items-end gap-3">
          <TextField
            label="Team ID"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1178869"
          />
          <Button type="submit" disabled={loading || !teamId}>
            {loading ? "Loading..." : "Find leagues"}
          </Button>
        </form>

        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {leagues && (
          <div className="mb-6 flex flex-wrap gap-2">
            {leagues.map((lg) => (
              <button
                key={lg.id}
                onClick={() => loadStandings(lg.id)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard ${
                  selectedLeague === lg.id
                    ? "border-pl-purple bg-pl-purple text-white"
                    : "border-border-strong text-text-primary hover:bg-slate-50"
                }`}
              >
                {lg.name}
              </button>
            ))}
          </div>
        )}

        {standingsLoading && <p className="text-text-muted">Loading standings...</p>}

        {standings && (
          <div>
            <h2 className="mb-3 font-semibold text-text-primary">{standings.league_name}</h2>
            {standings.standings.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No standings yet - 2026/27 GW1 hasn&apos;t been played. Once the season starts, ranks and a
                gameweek-by-gameweek score trend will appear here.
              </p>
            ) : (
              <>
                <div className="mb-6 overflow-x-auto rounded-lg border border-border shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-sunken">
                      <tr>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Rank</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Manager</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">GW pts</th>
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.standings.map((row) => (
                        <tr key={row.entry_id} className="border-t border-border">
                          <td className="px-3 py-2.5 font-mono">{row.rank}</td>
                          <td className="px-3 py-2.5 font-medium">{row.player_name}</td>
                          <td className="px-3 py-2.5 text-text-secondary">{row.entry_name}</td>
                          <td className="px-3 py-2.5 font-mono">{row.event_total}</td>
                          <td className="px-3 py-2.5 font-mono font-medium">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="mb-3 font-semibold text-text-primary">Total points by gameweek</h3>
                <LineChart
                  series={standings.trend.map((entry, i) => ({
                    label: entry.player_name,
                    color: seriesColor(i),
                    points: entry.series.map((s) => ({ x: s.event, y: s.total_points })),
                  }))}
                />
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
