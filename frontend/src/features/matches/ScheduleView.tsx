"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { ScheduleFixture } from "@/shared/types/api";

/**
 * Presentational: the page fetches on the server and hands the fixtures down.
 * The only state left is which gameweek is on screen.
 */
export function ScheduleView({ fixtures }: { fixtures: ScheduleFixture[] }) {
  // Open on the next gameweek still to be played. Derived from the same props
  // the server rendered, so the first client render agrees with the HTML.
  const [event, setEvent] = useState(
    () => fixtures.find((fx) => !fx.finished)?.event ?? 1,
  );

  const events = useMemo(
    () => [...new Set(fixtures.map((fx) => fx.event))].sort((a, b) => a - b),
    [fixtures],
  );

  const rows = useMemo(
    () => fixtures.filter((fx) => fx.event === event),
    [fixtures, event],
  );

  const minEvent = events[0] ?? 1;
  const maxEvent = events[events.length - 1] ?? 38;

  return (
    <div>

      {(
        <>
          <div className="mb-4 flex items-center gap-3">
            <Button size="sm" variant="secondary" onClick={() => setEvent((e) => Math.max(minEvent, e - 1))} disabled={event <= minEvent}>
              ← Prev
            </Button>
            <span className="font-mono text-sm font-medium text-text-primary">Gameweek {event}</span>
            <Button size="sm" variant="secondary" onClick={() => setEvent((e) => Math.min(maxEvent, e + 1))} disabled={event >= maxEvent}>
              Next →
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-text-muted">No fixtures scheduled for this gameweek.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rows.map((fx, i) => {
                // A fixture with no confirmed slot has a null kickoff_time;
                // MatchdayStrip shows those as TBC, so match it rather than
                // rendering "Invalid Date".
                const kickoff = fx.kickoff_time ? new Date(fx.kickoff_time) : null;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <TeamBadge teamShort={fx.team_h} name={fx.team_h} badgeUrl={fx.team_h_badge} />
                    </div>
                    <div className="shrink-0 px-2 text-center leading-tight">
                      {fx.finished ? (
                        <span className="font-mono text-base font-bold text-text-primary">
                          {fx.team_h_score}-{fx.team_a_score}
                        </span>
                      ) : kickoff ? (
                        <>
                          <div className="font-mono text-xs font-medium text-text-primary">
                            {kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                          <div className="font-mono text-[11px] text-text-muted">
                            {kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </>
                      ) : (
                        <div className="font-mono text-xs font-medium text-text-primary">TBC</div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                      <TeamBadge teamShort={fx.team_a} name={fx.team_a} badgeUrl={fx.team_a_badge} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
