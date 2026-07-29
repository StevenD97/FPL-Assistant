"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Button } from "@/shared/ui/Button";
import { Pill } from "@/shared/ui/Pill";
import { TextField } from "@/shared/ui/TextField";
import { TableSkeleton } from "@/shared/ui/Skeleton";
import { ConnectTeamPrompt } from "@/shared/team/ConnectTeamPrompt";
import { LineChart } from "@/shared/charts/LineChart";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { seriesColor } from "@/shared/lib/palette";
import {
  formatRank,
  loadTrackedLeagueIds,
  parseLeagueId,
  parseTeamId,
  storeTrackedLeagueIds,
} from "@/shared/lib/team";
import { apiGet } from "@/shared/lib/api";
import type { League, StandingsResponse } from "@/shared/types/api";

export default function LeaguesPage() {
  const { teamId: connectedTeamId } = useTeam();

  // One search box, two intents. `mode` disambiguates a bare number (is 314 a
  // team or a league?); a pasted FPL URL is auto-detected and overrides it.
  const [mode, setMode] = useState<"team" | "league">("team");
  const [query, setQuery] = useState("");
  const [rankTeamInput, setRankTeamInput] = useState("");
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trackedIds, setTrackedIds] = useState<number[]>([]);

  // Whose perspective "your rank" is computed from: the last team id searched,
  // falling back to whatever team is connected app-wide (sidebar).
  const rankTeamId = parseTeamId(rankTeamInput) ?? connectedTeamId ?? null;

  useEffect(() => {
    setTrackedIds(loadTrackedLeagueIds());
  }, []);

  async function findLeagues(teamId: number) {
    setRankTeamInput(String(teamId));
    setLoading(true);
    setError(null);
    setLeagues(null);
    setStandings(null);
    setSelectedLeague(null);
    try {
      setLeagues(await apiGet<League[]>(`/api/leagues/${teamId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function trackAndLoad(leagueId: number) {
    setTrackedIds((prev) => {
      const next = prev.includes(leagueId) ? prev : [...prev, leagueId];
      storeTrackedLeagueIds(next);
      return next;
    });
    loadStandings(leagueId);
  }

  // Single entry point for the unified search. A pasted URL wins over the
  // toggle (a league URL tracks a league even in "team" mode, and vice versa);
  // a bare number follows the toggle.
  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const s = query.trim();
    if (!s) return;
    const isLeagueUrl = /leagues\/\d+/i.test(s);
    const isTeamUrl = /entry\/\d+/i.test(s);
    const effectiveMode = isLeagueUrl ? "league" : isTeamUrl ? "team" : mode;

    if (effectiveMode === "league") {
      const id = parseLeagueId(s);
      if (id == null) {
        setError("Enter a numeric league ID or a pasted FPL league URL.");
        return;
      }
      setError(null);
      setQuery("");
      trackAndLoad(id);
    } else {
      const id = parseTeamId(s);
      if (id == null) {
        setError("Enter a numeric team ID or a pasted FPL team URL.");
        return;
      }
      setError(null);
      findLeagues(id);
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
      setStandings(await apiGet<StandingsResponse>(`/api/leagues/${leagueId}/standings?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStandingsLoading(false);
    }
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
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Leagues
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Standings and score trends for your mini-leagues - or track any public league, including a country
          league, to see where your score would rank without joining.
        </p>

        {/* Identity first: if a team is connected, one tap loads its leagues -
            no re-entering an ID. Otherwise coach them to connect. */}
        {connectedTeamId ? (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm">
            <span className="text-sm text-text-secondary">
              Connected as team <span className="font-mono font-semibold text-text-primary">{connectedTeamId}</span>
            </span>
            <Button size="sm" onClick={() => findLeagues(connectedTeamId)} disabled={loading}>
              {loading ? "Loading…" : "Find my leagues"}
            </Button>
          </div>
        ) : (
          <div className="mb-5">
            <ConnectTeamPrompt
              title="Connect to see your leagues"
              body="Add your FPL team to load your mini-leagues in one tap — or look up any team or public league below."
            />
          </div>
        )}

        {/* One search: toggle picks what a bare number means; a pasted FPL URL
            is auto-detected either way. */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Pill active={mode === "team"} onClick={() => setMode("team")}>
            My leagues
          </Pill>
          <Pill active={mode === "league"} onClick={() => setMode("league")}>
            Public league
          </Pill>
        </div>
        <form onSubmit={handleSearch} className="flex items-end gap-3">
          <TextField
            label={mode === "team" ? "Team ID or URL" : "League ID or URL"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "team" ? "e.g. 1178869 or your team URL" : "e.g. 314 or …/leagues/314/standings/c"
            }
            wrapperClassName="min-w-[240px] flex-1 sm:max-w-md"
          />
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? "Loading..." : mode === "team" ? "Find leagues" : "Track"}
          </Button>
        </form>
        <p className="mb-4 mt-1.5 text-xs text-text-secondary">
          {mode === "team"
            ? "See the mini-leagues your team is in, then pick one for standings and trends."
            : "Track any public league (joined or not), including a country league, to see where your score ranks. Saved on this device."}
        </p>

        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {leagues && leagues.length > 0 && (
          <div className="mb-4">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Your leagues
            </span>
            <div className="flex flex-wrap gap-2">
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
          </div>
        )}

        {trackedIds.length > 0 && (
          <div className="mb-6">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Tracked leagues
            </span>
            <div className="flex flex-wrap gap-2">
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
          </div>
        )}

        {standingsLoading && <TableSkeleton columns={4} rows={10} />}

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
                        <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                          <span className="inline-flex items-center gap-1">
                            GW pts <InfoTooltip term="gwPts" />
                          </span>
                        </th>
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
