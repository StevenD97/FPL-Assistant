"use client";

import { useState, type FormEvent } from "react";

type ChipRow = {
  event: number;
  squad_total_score: number;
  bench_score: number;
  best_captain_score: number;
  best_captain_name: string;
  blank_count: number;
  double_count: number;
};

type ChipResponse = {
  scan_start_event: number;
  scan_end_event: number;
  table: ChipRow[];
  bench_boost: { event: number; bench_score: number; double_count: number };
  triple_captain: { event: number; player: string; score: number };
  free_hit: { recommended: boolean; event: number; blank_count: number };
  wildcard: { reason: string; suggested_event: number } | null;
};

export default function ChipsPage() {
  const [teamId, setTeamId] = useState("");
  const [data, setData] = useState<ChipResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`http://localhost:8000/api/squad/${teamId}/chips`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          Chip Strategy
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Enter your FPL team ID to scan for chip timing (demo window: GW24-36
          of last season, since the 2026/27 season hasn&apos;t started).
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
          <input
            type="text"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1178869"
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={loading || !teamId}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {loading ? "Scanning..." : "Scan chips"}
          </button>
        </form>

        {error && <p className="mb-4 text-red-600">{error}</p>}

        {data && (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Bench Boost</p>
                <p className="text-lg font-semibold text-black dark:text-zinc-50">
                  GW{data.bench_boost.event}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  bench score {data.bench_boost.bench_score.toFixed(3)},{" "}
                  {data.bench_boost.double_count} doubles
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Triple Captain</p>
                <p className="text-lg font-semibold text-black dark:text-zinc-50">
                  GW{data.triple_captain.event} - {data.triple_captain.player}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  score {data.triple_captain.score.toFixed(3)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Free Hit</p>
                {data.free_hit.recommended ? (
                  <>
                    <p className="text-lg font-semibold text-black dark:text-zinc-50">
                      GW{data.free_hit.event}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {data.free_hit.blank_count} of your 15 blank
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No strong case in this window - hold the chip
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Wildcard</p>
                {data.wildcard ? (
                  <>
                    <p className="text-lg font-semibold text-black dark:text-zinc-50">
                      Around GW{data.wildcard.suggested_event}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {data.wildcard.reason}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No major cluster found
                  </p>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">GW</th>
                    <th className="px-3 py-2">Squad score</th>
                    <th className="px-3 py-2">Bench score</th>
                    <th className="px-3 py-2">Best captain</th>
                    <th className="px-3 py-2">Blanks</th>
                    <th className="px-3 py-2">Doubles</th>
                  </tr>
                </thead>
                <tbody>
                  {data.table.map((row) => (
                    <tr
                      key={row.event}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 font-medium">GW{row.event}</td>
                      <td className="px-3 py-2">{row.squad_total_score}</td>
                      <td className="px-3 py-2">{row.bench_score}</td>
                      <td className="px-3 py-2">
                        {row.best_captain_name} ({row.best_captain_score})
                      </td>
                      <td className="px-3 py-2">{row.blank_count}</td>
                      <td className="px-3 py-2">{row.double_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
