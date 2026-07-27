"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { Skeleton } from "@/shared/ui/Skeleton";
import { API_URL } from "@/shared/lib/api";


type Fixture = {
  event: number;
  kickoff_time: string;
  finished: boolean;
  team_h: string;
  team_a: string;
  team_h_badge: string;
  team_a_badge: string;
  team_h_score: number | null;
  team_a_score: number | null;
};

export function ScheduleView() {
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState(1);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/fixtures/schedule`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data: Fixture[] = await res.json();
        setFixtures(data);
        const nextUpcoming = data.find((fx) => !fx.finished);
        if (nextUpcoming) setEvent(nextUpcoming.event);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const events = useMemo(() => {
    if (!fixtures) return [];
    return [...new Set(fixtures.map((fx) => fx.event))].sort((a, b) => a - b);
  }, [fixtures]);

  const rows = useMemo(() => {
    if (!fixtures) return [];
    return fixtures.filter((fx) => fx.event === event);
  }, [fixtures, event]);

  const minEvent = events[0] ?? 1;
  const maxEvent = events[events.length - 1] ?? 38;

  return (
    <div>
      {loading && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16 rounded-md" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
            ))}
          </div>
        </>
      )}
      {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

      {fixtures && (
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
                const kickoff = new Date(fx.kickoff_time);
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
                      ) : (
                        <>
                          <div className="font-mono text-xs font-medium text-text-primary">
                            {kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </div>
                          <div className="font-mono text-[11px] text-text-muted">
                            {kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </>
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
