"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { TeamBadge } from "@/components/pitch/TeamBadge";

type OutlookFixture = { opponent: string; is_home: boolean; opponent_badge: string };

type OutlookRow = {
  id: number;
  live_id: number | null;
  web_name: string;
  team_short: string;
  team_badge: string;
  position: string;
  predicted_points: number;
  fixture_count: number;
  fixture_ticker: string;
  fixtures: OutlookFixture[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;

async function fetchOutlook(
  referenceDate: string | undefined,
  nextEvent: number | undefined,
  gwCount: number,
  limit: number
): Promise<OutlookRow[]> {
  const params = new URLSearchParams({ gw_count: String(gwCount), limit: String(limit) });
  if (referenceDate) params.set("reference_date", referenceDate);
  if (nextEvent) params.set("next_event", String(nextEvent));
  const res = await fetch(`${API_URL}/api/players/predicted-points-outlook?${params}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export default function OutlookPage() {
  // Empty/undefined means "let the backend pick the live current gameweek"
  // (see analysis.get_gw_context) - typing a value here explicitly
  // overrides that, e.g. to reproduce an earlier prediction.
  const [referenceDate, setReferenceDate] = useState("");
  const [nextEvent, setNextEvent] = useState<number | "">("");
  const [gwCount, setGwCount] = useState(5);
  const [limit, setLimit] = useState(100);
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [data, setData] = useState<OutlookRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(date: string, event: number | "", count: number, lim: number) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOutlook(date || undefined, event || undefined, count, lim));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Load once on mount with no explicit date/event, so the backend applies
  // its own dynamic "live current gameweek" default.
  useEffect(() => {
    load(referenceDate, nextEvent, gwCount, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    load(referenceDate, nextEvent, gwCount, limit);
  }

  const filtered = useMemo(() => {
    if (!data) return null;
    return position === "All" ? data : data.filter((row) => row.position === position);
  }, [data, position]);

  return (
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          Multi-gameweek outlook
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-text-secondary">
          Predicted points summed over a chosen run of gameweeks, ranked across every player.{" "}
          <SeasonDataNote mode="blended" />
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
          <TextField
            label="As of"
            type="date"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
            wrapperClassName="w-40"
          />
          <TextField
            label="Starting GW"
            type="number"
            min={1}
            max={38}
            value={nextEvent}
            onChange={(e) => setNextEvent(e.target.value === "" ? "" : Number(e.target.value))}
            wrapperClassName="w-24"
            placeholder="auto"
          />
          <TextField
            label="Window (GWs)"
            type="number"
            min={1}
            max={10}
            value={gwCount}
            onChange={(e) => setGwCount(Number(e.target.value))}
            wrapperClassName="w-24"
          />
          <TextField
            label="Show top"
            type="number"
            min={1}
            max={200}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            wrapperClassName="w-24"
          />
          <Select
            label="Position"
            value={position}
            onChange={(e) => setPosition(e.target.value as (typeof POSITIONS)[number])}
            options={POSITIONS}
            wrapperClassName="w-28"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Loading..." : "Update"}
          </Button>
        </form>

        {error && (
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
        )}

        {filtered && (
          <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">#</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Predicted pts</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">GWs</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Fixtures</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2.5 font-mono text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">
                      <PlayerLink id={row.live_id}>{row.web_name}</PlayerLink>
                    </td>
                    <td className="px-3 py-2.5">
                      <TeamBadge teamShort={row.team_short} name={row.team_short} badgeUrl={row.team_badge} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PositionBadge position={row.position} />
                    </td>
                    <td className="px-3 py-2.5 font-mono font-medium">{row.predicted_points.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-mono">{row.fixture_count}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {row.fixtures.map((fx, fi) => (
                          <span
                            key={fi}
                            className="inline-flex items-center gap-1 rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-text-secondary"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={fx.opponent_badge}
                              alt=""
                              className="h-3.5 w-3.5 object-contain"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                            {fx.opponent}
                            {fx.is_home ? "(H)" : "(A)"}
                          </span>
                        ))}
                      </div>
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
