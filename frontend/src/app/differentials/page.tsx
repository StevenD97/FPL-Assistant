"use client";

import { useEffect, useState, type FormEvent } from "react";

type PlayerScore = {
  web_name: string;
  team_short: string;
  position: string;
  recommendation_score: number;
  confidence_adjusted: number;
  rotation_risk: number;
  next_opponent: string;
  opponent_multiplier: number;
  form: number;
  ep_next: number;
  expected_minutes: number;
  selected_by_percent: number;
  expected_goal_involvements: number;
  ict_index: number;
  defensive_contribution_per_90: number;
  set_piece_duty_score: number;
  penalties_order: number;
  penalties_missed: number;
};

async function fetchDifferentials(maxOwnership: number, limit: number): Promise<PlayerScore[]> {
  const res = await fetch(
    `http://localhost:8000/api/players/scores?max_ownership=${maxOwnership}&limit=${limit}`
  );
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export default function DifferentialsPage() {
  const [maxOwnership, setMaxOwnership] = useState(10);
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState<PlayerScore[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(ownership: number, count: number) {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDifferentials(ownership, count));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Load once on mount with the default threshold.
  useEffect(() => {
    load(maxOwnership, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    load(maxOwnership, limit);
  }

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          Differentials
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Highest recommendation_score among low-ownership players (demo
          data: last season, since the 2026/27 season hasn&apos;t started).
        </p>
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Max ownership %
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={maxOwnership}
              onChange={(e) => setMaxOwnership(Number(e.target.value))}
              className="mt-1 w-28 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Show top
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1 w-28 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
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

        {data && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2">Team</th>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">Owned %</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Next opp</th>
                  <th className="px-3 py-2">ep_next</th>
                  <th className="px-3 py-2">Form</th>
                  <th className="px-3 py-2">Exp. mins</th>
                  <th className="px-3 py-2">xGI</th>
                  <th className="px-3 py-2">ICT</th>
                  <th className="px-3 py-2">Def/90</th>
                  <th className="px-3 py-2">Set-piece duty</th>
                  <th className="px-3 py-2">Pens</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2 font-medium">{p.web_name}</td>
                    <td className="px-3 py-2">{p.team_short}</td>
                    <td className="px-3 py-2">{p.position}</td>
                    <td className="px-3 py-2">{p.selected_by_percent}%</td>
                    <td className="px-3 py-2">{p.recommendation_score.toFixed(3)}</td>
                    <td className="px-3 py-2">{p.next_opponent}</td>
                    <td className="px-3 py-2">{p.ep_next}</td>
                    <td className="px-3 py-2">{p.form}</td>
                    <td className="px-3 py-2">{p.expected_minutes}</td>
                    <td className="px-3 py-2">{p.expected_goal_involvements}</td>
                    <td className="px-3 py-2">{p.ict_index}</td>
                    <td className="px-3 py-2">{p.defensive_contribution_per_90}</td>
                    <td className="px-3 py-2">{p.set_piece_duty_score.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {p.penalties_order === 1
                        ? "1st"
                        : p.penalties_order === 2
                        ? "2nd"
                        : "-"}
                      {p.penalties_missed > 0 ? ` (${p.penalties_missed} missed)` : ""}
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
