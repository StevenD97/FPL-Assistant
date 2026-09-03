"use client";

import { useState } from "react";

import { Alert } from "@/shared/ui/Alert";
import { apiGet } from "@/shared/lib/api";
import type { LeagueHolding, LeagueOwnership as LeagueOwnershipResponse } from "@/shared/types/api";

/**
 * What your league owns that you don't, and what you own that they don't.
 *
 * "Owned by 3% overall" is a fact about eleven million strangers and it does
 * not tell you anything. "Owned by nobody in your league of twelve, and by
 * both of the people above you" is a decision. This is the second one.
 *
 * Loaded on demand rather than with the standings, because it costs one
 * request per manager in the league and most visits to this page are just
 * looking at the table.
 *
 * Reads the last gameweek whose deadline has passed, not the next one. Picks
 * do not exist until a deadline locks them, so asking FPL for the upcoming
 * gameweek returns nothing for everybody - which looks exactly like a broken
 * league rather than a question that cannot be answered yet.
 */
export function LeagueOwnership({
  leagueId,
  teamId,
  nextEvent,
}: {
  leagueId: number;
  teamId: number | null;
  nextEvent: number | null;
}) {
  // The most recent gameweek anyone's picks are locked for.
  const event = nextEvent != null && nextEvent > 1 ? nextEvent - 1 : null;
  const [data, setData] = useState<LeagueOwnershipResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (event == null) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ event: String(event) });
      if (teamId != null) params.set("team_id", String(teamId));
      setData(await apiGet<LeagueOwnershipResponse>(`/api/leagues/${leagueId}/ownership?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Before the first deadline of the season there is nothing to compare.
  if (event == null) return null;

  return (
    <section className="mt-6 border-t border-border pt-5">
      <h3 className="text-md font-semibold text-text-primary">Who owns what in this league</h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">
        Not the game&apos;s &ldquo;selected by 43.2%&rdquo;, which counts a player on someone&apos;s
        bench the same as one wearing their armband. This counts how many times a score actually
        lands: a captain twice, a benched player not at all.
      </p>

      {!data && !loading && (
        <button
          type="button"
          onClick={load}
          className="tap-target mt-3 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary hover:border-border-strong"
        >
          Work it out for GW{event}
        </button>
      )}

      {loading && (
        <p className="mt-3 text-sm text-text-muted">
          Reading every manager&apos;s picks - one request each, so this takes a moment.
        </p>
      )}

      {error && (
        <Alert kind="warning">Couldn&apos;t read this league&apos;s picks ({error}).</Alert>
      )}

      {data && (
        <>
          <p className="mt-3 text-xs text-text-muted">
            Across {data.managers_counted} manager{data.managers_counted === 1 ? "" : "s"} in{" "}
            {data.league_name}
            {data.capped ? ", the top of the table" : ""}
            {data.rivals_above_you.length > 0
              ? `. Above you: ${data.rivals_above_you.join(", ")}.`
              : "."}
          </p>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <HoldingList
              title="What you have that they don't"
              empty={
                data.you_are_counted
                  ? "Nothing - your squad is your league's squad. That is a fine way to hold a lead and a hopeless way to close one."
                  : "You aren't in this league, so there's nothing to compare against. The list on the right is what this league owns."
              }
              rows={data.your_differentials.slice(0, 8)}
            />
            <HoldingList
              title={data.you_are_counted ? "What they have that you don't" : "What this league owns"}
              empty="Nothing. You own everything your league does."
              rows={data.your_exposure.slice(0, 8)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function HoldingList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: LeagueHolding[];
  empty: string;
}) {
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm leading-snug text-text-secondary">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((row) => (
            <li
              key={row.element}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border/60 py-2 last:border-0"
            >
              <span className="text-sm font-semibold text-text-primary">
                {row.web_name}
                <span className="ml-1.5 font-normal text-text-muted">
                  {row.team_short} {row.pos}
                </span>
              </span>
              <span className="font-mono text-sm text-text-secondary">{row.effective}%</span>
              <span className="w-full text-xs leading-snug text-text-muted">
                {row.verdict}
                {row.rival_count > 0 && row.rivals_owning > 0
                  ? ` - including ${row.rivals_owning} of the ${row.rival_count} above you`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
