"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/components/team/TeamProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { LineChart } from "@/components/charts/LineChart";
import { seriesColor } from "@/lib/palette";
import {
  formatRank,
  loadTrackedLeagueIds,
  parseLeagueId,
  parseTeamId,
  storeTrackedLeagueIds,
} from "@/lib/team";
import { API_URL } from "@/lib/api";


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

type YourRank = {
  team_id: number;
  total_points: number;
  rank: number | null;
  searched_at_least: number;
  found_exact: boolean;
};

type StandingsResponse = {
  league_name: string;
  standings: StandingRow[];
  trend: TrendEntry[];
  your_rank: YourRank | null;
};

export default function LeaguesPage() {
  const { teamId: connectedTeamId } = useTeam();

  const [teamId, setTeamId] = useState("");
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trackedIds, setTrackedIds] = useState<number[]>([]);
  const [trackInput, setTrackInput] = useState("");
  const [trackError, setTrackError] = useState<string | null>(null);

  // Whose perspective "your rank" is computed from: the team id actively
  // typed into the Find-leagues field, falling back to whatever team is
  // connected app-wide (sidebar "Connect your team") if that field is empty.
  const rankTeamId = parseTeamId(teamId) ?? connectedTeamId ?? null;

  useEffect(() => {
    setTrackedIds(loadTrackedLeagueIds());
  }, []);

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
    setError(null);
    try {
      const params = new URLSearchParams();
      if (rankTeamId) params.set("team_id", String(rankTeamId));
      const res = await fetch(`${API_URL}/api/leagues/${leagueId}/standings?${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setStandings(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStandingsLoading(false);
    }
  }

  function handleTrackLeague(e: FormEvent) {
    e.preventDefault();
    const id = parseLeagueId(trackInput);
    if (id == null) {
      setTrackError("Enter a numeric league ID or a pasted FPL league URL.");
      return;
    }
    setTrackError(null);
    setTrackInput("");
    const next = trackedIds.includes(id) ? trackedIds : [...trackedIds, id];
    setTrackedIds(next);
    storeTrackedLeagueIds(next);
    loadStandings(id);
  }

  function untrackLeague(id: number) {
    const next = trackedIds.filter((x) => x !== id);
    setTrackedIds(next);
    storeTrackedLeagueIds(next);
    if (selectedLeague === id) {
      setSelectedLeague(null);
      setStandings(null);
    }
  }

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Leagues
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Standings and score trends for your mini-leagues - or track any public league, including a country
          league, to see where your score would rank without joining.
        </p>

        <form onSubmit={handleFindLeagues} className="mb-3 flex items-end gap-3">
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

        <div className="mb-6 rounded-lg border border-border bg-surface-sunken p-4">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Track a public league</h2>
          <p className="mb-3 text-xs text-text-secondary">
            Paste any public FPL league&apos;s ID or URL, joined or not. Saved on this device.
          </p>
          <form onSubmit={handleTrackLeague} className="flex items-end gap-3">
            <TextField
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="e.g. 314 or …/leagues/314/standings/c"
              wrapperClassName="flex-1"
            />
            <Button type="submit" variant="accent" disabled={!trackInput.trim()}>
              Track
            </Button>
          </form>
          {trackError && <p className="mt-2 text-sm font-medium text-danger">{trackError}</p>}

          {trackedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {trackedIds.map((id) => (
                <span
                  key={id}
                  className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard ${
                    selectedLeague === id
                      ? "border-pl-purple bg-pl-purple text-white"
                      : "border-border-strong bg-white text-text-primary"
                  }`}
                >
                  <button onClick={() => loadStandings(id)} className="hover:underline">
                    League {id}
                  </button>
                  <button
                    onClick={() => untrackLeague(id)}
                    aria-label={`Stop tracking league ${id}`}
                    className="opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {standingsLoading && <p className="text-text-muted">Loading standings...</p>}

        {standings && (
          <div>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-semibold text-text-primary">{standings.league_name}</h2>
              {selectedLeague != null && (
                trackedIds.includes(selectedLeague) ? (
                  <span className="text-xs font-medium text-pl-purple">Tracked</span>
                ) : (
                  <button
                    onClick={() => {
                      const next = [...trackedIds, selectedLeague];
                      setTrackedIds(next);
                      storeTrackedLeagueIds(next);
                    }}
                    className="rounded-md border border-pl-purple px-2.5 py-1 text-xs font-semibold text-pl-purple hover:bg-pl-purple/5"
                  >
                    + Track this league
                  </button>
                )
              )}
            </div>
            <p className="mb-3 -mt-2 text-xs text-text-muted">
              Tap &quot;Track this league&quot; to save it here, then clear the Team ID field (or connect your own
              team) to see where <em>your</em> score would rank in it.
            </p>

            {standings.your_rank && (
              <div className="mb-4 rounded-lg border border-pl-purple/30 bg-pl-purple/5 px-4 py-3 text-sm">
                {standings.your_rank.found_exact ? (
                  <>
                    Your <span className="font-mono font-semibold">{standings.your_rank.total_points}</span> points
                    would rank you <span className="font-semibold text-pl-purple">#{formatRank(standings.your_rank.rank)}</span> in
                    this league.
                  </>
                ) : (
                  <>
                    Your <span className="font-mono font-semibold">{standings.your_rank.total_points}</span> points
                    would rank beyond the top {formatRank(standings.your_rank.searched_at_least)} searched in this
                    league (too large to search exhaustively).
                  </>
                )}
              </div>
            )}
            {!standings.your_rank && rankTeamId && standings.standings.length > 0 && (
              <p className="mb-4 text-xs text-text-muted">
                Couldn&apos;t look up team {rankTeamId}&apos;s points to compare against this league.
              </p>
            )}

            {standings.standings.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No standings yet - 2026/27 GW1 hasn&apos;t been played. Once the season starts, ranks and a
                gameweek-by-gameweek score trend will appear here.
              </p>
            ) : (
              <>
                <div className="mb-6 overflow-x-auto rounded-lg border border-border shadow-sm">
                  <table className="table-cards w-full text-left text-sm">
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
                          <td data-label="Rank" className="px-3 py-2.5 font-mono">{row.rank}</td>
                          <td className="cell-primary px-3 py-2.5 font-medium">{row.player_name}</td>
                          <td data-label="Team" className="px-3 py-2.5 text-text-secondary">{row.entry_name}</td>
                          <td data-label="GW pts" className="px-3 py-2.5 font-mono">{row.event_total}</td>
                          <td data-label="Total" className="px-3 py-2.5 font-mono font-medium">{row.total}</td>
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
