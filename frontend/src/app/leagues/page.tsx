"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Button } from "@/shared/ui/Button";
import { Select } from "@/shared/ui/Select";
import { TextField } from "@/shared/ui/TextField";
import { TableSkeleton } from "@/shared/ui/Skeleton";
import { ConnectTeamPrompt } from "@/shared/team/ConnectTeamPrompt";
import { LineChart } from "@/shared/charts/LineChart";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { seriesColor } from "@/shared/lib/palette";
import { pickTrendSeries, TREND_SERIES_CAP } from "@/shared/lib/leagueTrend";
import {
  formatRank,
  loadLastViewedLeagueId,
  loadTrackedLeagueIds,
  loadTrackedLeagueNames,
  parseLeagueId,
  parseTeamId,
  storeLastViewedLeagueId,
  storeTrackedLeagueIds,
  storeTrackedLeagueName,
} from "@/shared/lib/team";
import { apiGet } from "@/shared/lib/api";
import { useSeasonStatus } from "@/shared/lib/useSeasonStatus";
import { LeagueOwnership } from "@/features/leagues/LeagueOwnership";
import type { League, StandingsResponse } from "@/shared/types/api";

// The two things the one search box can look up. Values double as the
// <option> text, so they're shared between the control and the mode it maps to.
const TEAM_OPTION = "A team";
const LEAGUE_OPTION = "A league";

/** A row in the unified league list, whichever source it came from. */
type LeagueChoice = { id: number; name: string; tracked: boolean };

export default function LeaguesPage() {
  const { teamId: connectedTeamId } = useTeam();
  const seasonStatus = useSeasonStatus();

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
  const [trackedNames, setTrackedNames] = useState<Record<string, string>>({});
  const [showAllTrend, setShowAllTrend] = useState(false);
  // The manual team/league lookup, collapsed by default now that a connected
  // team loads its own leagues - see the disclosure below.
  const [lookupOpen, setLookupOpen] = useState(false);

  // Whose perspective "your rank" is computed from: the last team id searched,
  // falling back to whatever team is connected app-wide (sidebar).
  const rankTeamId = parseTeamId(rankTeamInput) ?? connectedTeamId ?? null;

  useEffect(() => {
    setTrackedIds(loadTrackedLeagueIds());
    setTrackedNames(loadTrackedLeagueNames());
  }, []);

  // Connecting a team is the only identity this page needs, so a connected team
  // loads its own leagues rather than asking for the ID it already has. This is
  // one request (FPL returns league membership on the entry itself - see
  // services/leagues.manager_leagues), which is why it's safe to fire on arrival;
  // standings are the expensive call and stay deliberate, below.
  //
  // The ref guards against re-firing: `connectedTeamId` arrives a beat after
  // mount (TeamProvider restores it from localStorage), and without this a
  // manual lookup for someone else's team would be overwritten the moment any
  // dependency changed.
  const autoLoadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (connectedTeamId == null || autoLoadedFor.current === connectedTeamId) return;
    autoLoadedFor.current = connectedTeamId;
    findLeagues(connectedTeamId);
  }, [connectedTeamId]);

  // The team's own leagues and the tracked public ones, merged into one list.
  // A league in both shows once, keeping its real name from the team lookup.
  const leagueChoices = useMemo<LeagueChoice[]>(() => {
    const byId = new Map<number, LeagueChoice>();
    for (const lg of leagues ?? []) {
      byId.set(lg.id, { id: lg.id, name: lg.name, tracked: trackedIds.includes(lg.id) });
    }
    for (const id of trackedIds) {
      const existing = byId.get(id);
      if (existing) {
        existing.tracked = true;
        continue;
      }
      byId.set(id, { id, name: trackedNames[String(id)] ?? `League ${id}`, tracked: true });
    }
    return [...byId.values()];
  }, [leagues, trackedIds, trackedNames]);

  // Land on standings rather than a picker - but only when the choice is
  // unambiguous, because league_standings fans out to one request per shown
  // manager plus a paged rank search (services/leagues.py). Guessing wrong would
  // spend several seconds fetching a league you didn't ask about, on every visit.
  //
  // "Unambiguous" means: the league you last opened (if it's still in your list),
  // or a single league with no alternative to choose between.
  //
  // Declared after leagueChoices rather than beside the auto-load effect above:
  // the dependency array is evaluated during render, so referencing the memo
  // before its `const` would hit the temporal dead zone.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || selectedLeague != null || leagueChoices.length === 0) return;
    const remembered = loadLastViewedLeagueId();
    const target =
      remembered != null && leagueChoices.some((lg) => lg.id === remembered)
        ? remembered
        : leagueChoices.length === 1
          ? leagueChoices[0].id
          : null;
    if (target == null) return;
    autoOpened.current = true;
    loadStandings(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueChoices, selectedLeague]);

  const trendSeries = useMemo(
    () => pickTrendSeries(standings?.trend ?? [], { showAll: showAllTrend, myEntryId: rankTeamId }),
    [standings, showAllTrend, rankTeamId],
  );

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

  // Pin a league to this device. Names are cached separately from the id list,
  // so a league tracked before we ever saw its standings still gets a label.
  function trackLeague(leagueId: number, name?: string) {
    setTrackedIds((prev) => {
      const next = prev.includes(leagueId) ? prev : [...prev, leagueId];
      storeTrackedLeagueIds(next);
      return next;
    });
    if (name) {
      storeTrackedLeagueName(leagueId, name);
      setTrackedNames((prev) => ({ ...prev, [String(leagueId)]: name }));
    }
  }

  function trackAndLoad(leagueId: number) {
    trackLeague(leagueId);
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
    // Remembered before the fetch, not after: opening a league is the intent
    // worth recording, and a league whose standings fail to load (a private one,
    // say) is still the one you were looking at.
    storeLastViewedLeagueId(leagueId);
    try {
      const params = new URLSearchParams();
      if (rankTeamId) params.set("team_id", String(rankTeamId));
      const res = await apiGet<StandingsResponse>(`/api/leagues/${leagueId}/standings?${params}`);
      setStandings(res);
      // Learn the real name whether or not it's tracked yet, so the list can
      // label it properly the moment it is.
      if (res.league_name) {
        storeTrackedLeagueName(leagueId, res.league_name);
        setTrackedNames((prev) => ({ ...prev, [String(leagueId)]: res.league_name }));
      }
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
    // Only close the standings if untracking drops the league off the list
    // entirely - one of the team's own leagues stays selectable either way.
    const stillListed = (leagues ?? []).some((lg) => lg.id === id);
    if (selectedLeague === id && !stillListed) {
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

        {/* Identity is the whole input this page needs: a connected team loads
            its own leagues on arrival (see the auto-load effect), so there's no
            ID to re-enter and no button to press for the common case. Without a
            team, connecting is the ask - not a search box. */}
        {connectedTeamId ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-sm text-text-secondary">
              {loading ? (
                <>
                  Loading leagues for team{" "}
                  <span className="font-mono font-semibold text-text-primary">{connectedTeamId}</span>…
                </>
              ) : leagues ? (
                <>
                  <span className="font-mono font-semibold text-text-primary">{leagues.length}</span> league
                  {leagues.length === 1 ? "" : "s"} for team{" "}
                  <span className="font-mono font-semibold text-text-primary">{connectedTeamId}</span>
                </>
              ) : (
                <>
                  Connected as team{" "}
                  <span className="font-mono font-semibold text-text-primary">{connectedTeamId}</span>
                </>
              )}
            </span>
            {!loading && (
              <button
                type="button"
                onClick={() => findLeagues(connectedTeamId)}
                className="tap-target inline-flex items-center text-xs font-semibold text-pl-purple hover:underline"
              >
                Refresh
              </button>
            )}
          </div>
        ) : (
          <div className="mb-5">
            <ConnectTeamPrompt
              title="Connect to see your leagues"
              body="Add your FPL team and your mini-leagues load themselves — or look up any team or public league below."
            />
          </div>
        )}

        {/* The manual lookup is now the exception, so it's collapsed rather than
            leading the page. It still does both jobs it always did - and the
            parsing below is unchanged - but a reader with a team connected no
            longer has to walk past a form asking for the ID we already have. */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => {
              setLookupOpen((o) => !o);
              setError(null);
            }}
            aria-expanded={lookupOpen}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-pl-purple/40 hover:text-pl-purple"
          >
            <span aria-hidden="true" className="text-text-muted">
              {lookupOpen ? "−" : "＋"}
            </span>
            Look up another team or track a public league
          </button>

          <AnimatePresence>
            {lookupOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-xl border border-border bg-white p-3 shadow-sm">
                  {/* One search row for both intents. The selector only
                      disambiguates a bare number (is 314 a team or a league?) -
                      a pasted FPL URL is auto-detected and overrides it either
                      way. */}
                  <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
                    <Select
                      label="Look up"
                      options={[TEAM_OPTION, LEAGUE_OPTION]}
                      value={mode === "team" ? TEAM_OPTION : LEAGUE_OPTION}
                      onChange={(e) => setMode(e.target.value === LEAGUE_OPTION ? "league" : "team")}
                      wrapperClassName="w-[9.5rem]"
                    />
                    <TextField
                      label={mode === "team" ? "Team ID or URL" : "League ID or URL"}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        mode === "team" ? "e.g. 1178869 or your team URL" : "e.g. 314 or …/leagues/314/standings/c"
                      }
                      wrapperClassName="min-w-[200px] flex-1 sm:max-w-sm"
                    />
                    <Button type="submit" disabled={loading || !query.trim()}>
                      {loading ? "Loading..." : mode === "team" ? "Find leagues" : "Track"}
                    </Button>
                  </form>
                  <p className="mt-1.5 text-xs text-text-secondary">
                    {mode === "team"
                      ? "Loads the mini-leagues that team is in, then pick one below for standings and trends."
                      : "Tracks any public league (joined or not), including a country league, to see where your score ranks. Saved on this device."}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {/* One list, not two: the leagues your team is in and the public ones
            you've tracked are the same choice - pick one to open its standings.
            Provenance is a marker on the row rather than a separate section. */}
        {leagueChoices.length > 0 && (
          <div className="mb-6">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Your leagues
            </span>
            <div className="flex flex-wrap gap-2">
              {leagueChoices.map((lg) => {
                const selected = selectedLeague === lg.id;
                return (
                  <span
                    key={lg.id}
                    className={`flex items-center gap-1.5 rounded-md border pl-3 pr-2 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard ${
                      selected
                        ? "border-pl-purple bg-pl-purple text-white"
                        : "border-border-strong bg-white text-text-primary hover:bg-slate-50"
                    }`}
                  >
                    <button onClick={() => loadStandings(lg.id)} className="hover:underline">
                      {lg.name}
                    </button>
                    {lg.tracked && (
                      <span
                        title="Tracked on this device"
                        className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          selected ? "text-white/70" : "text-text-muted"
                        }`}
                      >
                        tracked
                      </span>
                    )}
                    {lg.tracked ? (
                      <button
                        onClick={() => untrackLeague(lg.id)}
                        aria-label={`Stop tracking ${lg.name}`}
                        className="opacity-70 hover:opacity-100"
                      >
                        ×
                      </button>
                    ) : (
                      <button
                        onClick={() => trackLeague(lg.id, lg.name)}
                        aria-label={`Track ${lg.name}`}
                        title="Keep this league on this device"
                        className="opacity-70 hover:opacity-100"
                      >
                        +
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {standingsLoading && <TableSkeleton columns={4} rows={10} />}

        {standings && (
          <div>
            {/* Tracking lives on the list row above (+ / ×), so the header is
                just the league's name - no second control for the same thing. */}
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-semibold text-text-primary">{standings.league_name}</h2>
              {selectedLeague != null && trackedIds.includes(selectedLeague) && (
                <span className="text-xs font-medium text-pl-purple">Tracked</span>
              )}
            </div>

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

                {/* Capped by default: a league can return 20 entries, and 20
                    lines on one axis is unreadable. Your own team is always
                    kept, whatever its rank, so the chart stays about you. */}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h3 className="font-semibold text-text-primary">Total points by gameweek</h3>
                  {standings.trend.length > TREND_SERIES_CAP && (
                    <button
                      type="button"
                      onClick={() => setShowAllTrend((v) => !v)}
                      className="tap-target inline-flex items-center text-xs font-semibold text-pl-purple hover:underline"
                    >
                      {showAllTrend
                        ? `Show top ${TREND_SERIES_CAP}`
                        : `Show all ${standings.trend.length}`}
                    </button>
                  )}
                </div>
                <LineChart
                  series={trendSeries.map((entry, i) => ({
                    label: entry.player_name,
                    color: seriesColor(i),
                    points: entry.series.map((s) => ({ x: s.event, y: s.total_points })),
                  }))}
                />
                {!showAllTrend && standings.trend.length > trendSeries.length && (
                  <p className="mt-2 text-xs text-text-muted">
                    Showing {trendSeries.length} of {standings.trend.length} managers.
                  </p>
                )}
              </>
            )}

            {/* Below the table, not above it: the standings are what people
                come here for, and this is the follow-up question. */}
            {selectedLeague != null && (
              <LeagueOwnership
                leagueId={selectedLeague}
                teamId={rankTeamId}
                nextEvent={seasonStatus?.next_event ?? null}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
