"use client";

import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

type TransferPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  predicted_points: number;
};

type OptimizerResponse = {
  transfers_made: number;
  free_transfers: number;
  points_hit: number;
  predicted_points: number;
  transferred_out: TransferPlayer[];
  transferred_in: TransferPlayer[];
};

export default function SquadPage() {
  const [teamId, setTeamId] = useState("");
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [optimizer, setOptimizer] = useState<OptimizerResponse | null>(null);
  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);

  async function loadOptimizer(id: string) {
    setOptimizerLoading(true);
    setOptimizerError(null);
    setOptimizer(null);
    try {
      const res = await fetch(
        `${API_URL}/api/squad/${id}/optimize-transfers?free_transfers=${freeTransfers}`
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setOptimizer(await res.json());
    } catch (err) {
      // Suggested transfers are a bonus on top of the squad view, not a
      // blocker - if this fails (e.g. FPL's picks-history reset - see
      // README) the squad above still loaded fine, so fail quietly here.
      setOptimizerError(err instanceof Error ? err.message : "Couldn't compute suggested transfers");
    } finally {
      setOptimizerLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`${API_URL}/api/squad/${teamId}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
      loadOptimizer(teamId); // fires automatically alongside the squad view, not gated on a separate action
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
        <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Team ID
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              placeholder="e.g. 1178869"
              className="mt-1 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
            Free transfers
            <input
              type="number" min={0} max={5}
              value={freeTransfers}
              onChange={(e) => setFreeTransfers(Number(e.target.value))}
              className="mt-1 w-28 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
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

            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h3 className="mb-2 font-semibold text-black dark:text-zinc-50">
                Suggested transfers
              </h3>
              <p className="mb-3 text-xs text-zinc-500">
                Computed automatically from your squad and bank above - the
                provably optimal set of transfers under FPL&apos;s real rules
                (budget, formation, max 3 per club), weighing predicted points
                against the -4 hit per transfer beyond your free ones. See{" "}
                <a href="/optimizer" className="underline">
                  Optimizer
                </a>{" "}
                for the from-scratch squad builder.
              </p>

              {optimizerLoading && (
                <p className="text-sm text-zinc-500">Solving...</p>
              )}

              {optimizerError && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Couldn&apos;t compute suggested transfers ({optimizerError}) - the squad
                  above is unaffected.
                </p>
              )}

              {optimizer && (
                <>
                  <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">{optimizer.transfers_made}</span>{" "}
                    transfer{optimizer.transfers_made === 1 ? "" : "s"}
                    {" · "}
                    {optimizer.points_hit > 0 ? (
                      <span className="text-red-600 dark:text-red-400">
                        -{optimizer.points_hit} pt hit
                      </span>
                    ) : (
                      <span>no hit</span>
                    )}
                    {" · "}
                    predicted XI points (after hit){" "}
                    <span className="font-medium">
                      {optimizer.predicted_points.toFixed(2)}
                    </span>
                  </p>

                  {optimizer.transferred_out.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
                          Out
                        </p>
                        <ul className="text-sm">
                          {optimizer.transferred_out.map((p) => (
                            <li key={p.id} className="border-t border-zinc-200 py-1 dark:border-zinc-800">
                              {p.web_name}{" "}
                              <span className="text-zinc-500">
                                ({p.team_short}, {p.position})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase text-zinc-500">
                          In
                        </p>
                        <ul className="text-sm">
                          {optimizer.transferred_in.map((p) => (
                            <li key={p.id} className="border-t border-zinc-200 py-1 dark:border-zinc-800">
                              {p.web_name}{" "}
                              <span className="text-zinc-500">
                                ({p.team_short}, {p.position})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      No changes recommended - your squad is already optimal for this window.
                    </p>
                  )}
                </>
              )}
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
