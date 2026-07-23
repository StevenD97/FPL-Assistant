"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type OutlookRow = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  predicted_points: number;
  fixture_count: number;
  fixture_ticker: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POSITIONS = ["All", "GKP", "DEF", "MID", "FWD"] as const;

async function fetchOutlook(
  referenceDate: string,
  nextEvent: number,
  gwCount: number,
  limit: number
): Promise<OutlookRow[]> {
  const res = await fetch(
    `${API_URL}/api/players/predicted-points-outlook?reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export default function OutlookPage() {
  const [referenceDate, setReferenceDate] = useState("2025-11-30");
  const [nextEvent, setNextEvent] = useState(10);
  const [gwCount, setGwCount] = useState(5);
  const [limit, setLimit] = useState(100);
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("All");
  const [data, setData] = useState<OutlookRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(date: string, event: number, count: number, lim: number) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOutlook(date, event, count, lim));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Load once on mount with the default window.
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
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          Multi-Gameweek Outlook
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Predicted points summed over a run of upcoming gameweeks (demo
          data: last season, since the 2026/27 season hasn&apos;t started).
          Backtesting found this window-based total tracks what actually
          happens noticeably better than a single-gameweek prediction does
          - most of a single week&apos;s &quot;miss&quot; is real football
          variance that averages out over several fixtures, not a modeling
          gap. Use this for transfer targets, not a promise of next week&apos;s
          score.
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            As of
            <input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              className="mt-1 w-40 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Starting GW
            <input
              type="number"
              min={1}
              max={38}
              value={nextEvent}
              onChange={(e) => setNextEvent(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Window (GWs)
            <input
              type="number"
              min={1}
              max={10}
              value={gwCount}
              onChange={(e) => setGwCount(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Show top
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Position
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as (typeof POSITIONS)[number])}
              className="mt-1 w-28 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? "Loading..." : "Update"}
          </button>
        </form>

        {error && <p className="mb-4 text-red-600">{error}</p>}

        {filtered && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Predicted pts</th>
                  <th className="px-3 py-2">Fixtures</th>
                  <th className="px-3 py-2">Ticker</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => (
                  <tr key={row.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{row.web_name}</td>
                    <td className="px-3 py-2">{row.team_short}</td>
                    <td className="px-3 py-2">{row.position}</td>
                    <td className="px-3 py-2 font-medium">{row.predicted_points.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.fixture_count}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {row.fixture_ticker}
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
