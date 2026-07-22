"use client";

import { useState, type FormEvent } from "react";

type SquadPlayer = {
  position: number;
  web_name: string;
  team_short: string;
  pos: string;
  role: string;
  captain_flag: string;
  recommendation_score: number;
  next_opponent: string;
  opponent_multiplier: number;
  rotation_risk: number;
  form: number;
  ep_next: number;
  expected_minutes: number;
  expected_goal_involvements: number;
  ict_index: number;
  defensive_contribution_per_90: number;
  set_piece_duty_score: number;
};

type CaptaincyOption = {
  web_name: string;
  team_short: string;
  pos: string;
  recommendation_score: number;
  ep_next: number;
  captain_flag: string;
};

type FixtureOutlookRow = {
  team_short: string;
  fixture_score: number;
  avg_difficulty: number | null;
  ticker: string;
};

type SquadResponse = {
  entry_name: string;
  event: number;
  points: number;
  squad_value: number;
  bank: number;
  squad: SquadPlayer[];
  category_scores: Record<string, number>;
  bench_depth_score: number | null;
  captaincy_options: CaptaincyOption[];
  fixture_outlook: FixtureOutlookRow[];
};

export default function SquadPage() {
  const [teamId, setTeamId] = useState("");
  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`http://localhost:8000/api/squad/${teamId}`);
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
          My Squad
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Enter your FPL team ID to see your squad analysis (demo data: GW38
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
            {loading ? "Loading..." : "Load squad"}
          </button>
        </form>

        {error && <p className="mb-4 text-red-600">{error}</p>}

        {data && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                {data.entry_name} - GW{data.event}
              </h2>
              <p className="text-zinc-600 dark:text-zinc-400">
                {data.points} points that GW - £{data.squad_value}m squad
                value - £{data.bank}m in bank
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 dark:bg-zinc-900">
                  <tr>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">Next opp</th>
                    <th className="px-3 py-2">ep_next</th>
                    <th className="px-3 py-2">xGI</th>
                    <th className="px-3 py-2">ICT</th>
                    <th className="px-3 py-2">Def/90</th>
                    <th className="px-3 py-2">Set-piece duty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.squad.map((p) => (
                    <tr
                      key={p.position}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 font-medium">
                        {p.web_name} {p.captain_flag}
                      </td>
                      <td className="px-3 py-2">{p.team_short}</td>
                      <td className="px-3 py-2">{p.pos}</td>
                      <td className="px-3 py-2">{p.role}</td>
                      <td className="px-3 py-2">
                        {p.recommendation_score.toFixed(3)}
                      </td>
                      <td className="px-3 py-2">{p.next_opponent}</td>
                      <td className="px-3 py-2">{p.ep_next}</td>
                      <td className="px-3 py-2">{p.expected_goal_involvements}</td>
                      <td className="px-3 py-2">{p.ict_index}</td>
                      <td className="px-3 py-2">{p.defensive_contribution_per_90}</td>
                      <td className="px-3 py-2">{p.set_piece_duty_score.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {Object.entries(data.category_scores).map(([pos, score]) => (
                <div
                  key={pos}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <p className="text-sm text-zinc-500">{pos}</p>
                  <p className="text-xl font-semibold text-black dark:text-zinc-50">
                    {score.toFixed(3)}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">Bench depth</p>
                <p className="text-xl font-semibold text-black dark:text-zinc-50">
                  {data.bench_depth_score?.toFixed(3) ?? "-"}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-black dark:text-zinc-50">
                Captaincy options
              </h3>
              <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {data.captaincy_options.map((c, i) => (
                  <li key={i}>
                    {c.web_name} ({c.team_short}, {c.pos}) - score{" "}
                    {c.recommendation_score.toFixed(3)}, ep_next {c.ep_next}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-black dark:text-zinc-50">
                Fixture outlook
              </h3>
              <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {data.fixture_outlook.map((f, i) => (
                  <li key={i}>
                    {f.team_short}: score {f.fixture_score} (avg FDR{" "}
                    {f.avg_difficulty}) - {f.ticker}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
