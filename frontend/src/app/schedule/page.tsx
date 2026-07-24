"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TeamBadge } from "@/components/pitch/TeamBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Fixture = {
  event: number;
  kickoff_time: string;
  finished: boolean;
  team_h: string;
  team_a: string;
  team_h_score: number | null;
  team_a_score: number | null;
};

export default function SchedulePage() {
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
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Schedule &amp; results
        </h1>
        <p className="mb-6 text-sm text-text-secondary">2026/27 fixtures, gameweek by gameweek.</p>

        {loading && <p className="text-text-muted">Loading fixtures...</p>}
        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {fixtures && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEvent((e) => Math.max(minEvent, e - 1))}
                disabled={event <= minEvent}
              >
                ← Prev
              </Button>
              <span className="font-mono text-sm font-medium text-text-primary">Gameweek {event}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEvent((e) => Math.min(maxEvent, e + 1))}
                disabled={event >= maxEvent}
              >
                Next →
              </Button>
            </div>

            <div className="overflow-hidden rounded-lg border border-border shadow-sm">
              {rows.map((fx, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? "border-t border-border" : ""}`}
                >
                  <div className="flex flex-1 justify-end">
                    <TeamBadge teamShort={fx.team_h} name={fx.team_h} />
                  </div>
                  <div className="mx-4 w-24 shrink-0 text-center font-mono font-medium text-text-primary">
                    {fx.finished
                      ? `${fx.team_h_score} - ${fx.team_a_score}`
                      : new Date(fx.kickoff_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                  <div className="flex flex-1">
                    <TeamBadge teamShort={fx.team_a} name={fx.team_a} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
