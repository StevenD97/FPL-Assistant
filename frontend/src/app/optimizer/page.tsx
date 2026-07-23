"use client";

import { useState, type FormEvent } from "react";

type SquadRow = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  predicted_points: number;
  role: "Starting XI" | "Bench";
  captain: boolean;
  cost: number;
};

type BestSquadResult = {
  squad: SquadRow[];
  total_cost: number;
  predicted_points: number;
};

type TransferPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  predicted_points: number;
};

type TransferResult = BestSquadResult & {
  transfers_made: number;
  free_transfers: number;
  points_hit: number;
  transferred_out: TransferPlayer[];
  transferred_in: TransferPlayer[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"];

function sortSquad(squad: SquadRow[]): SquadRow[] {
  return [...squad].sort((a, b) => {
    if (a.role !== b.role) return a.role === "Starting XI" ? -1 : 1;
    return POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
  });
}

function SquadTable({ squad }: { squad: SquadRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Cost</th>
            <th className="px-3 py-2">Predicted pts</th>
          </tr>
        </thead>
        <tbody>
          {sortSquad(squad).map((p) => (
            <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-3 py-2 text-zinc-500">{p.role === "Starting XI" ? "XI" : "Bench"}</td>
              <td className="px-3 py-2 font-medium">
                {p.web_name}
                {p.captain && <span className="ml-1 text-zinc-500">(C)</span>}
              </td>
              <td className="px-3 py-2">{p.team_short}</td>
              <td className="px-3 py-2">{p.position}</td>
              <td className="px-3 py-2">£{p.cost.toFixed(1)}m</td>
              <td className="px-3 py-2 font-medium">{p.predicted_points.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestSquadPanel() {
  const [referenceDate, setReferenceDate] = useState("2025-11-30");
  const [nextEvent, setNextEvent] = useState(10);
  const [gwCount, setGwCount] = useState(5);
  const [budget, setBudget] = useState(1000);
  const [result, setResult] = useState<BestSquadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/optimizer/best-squad?reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&budget=${budget}`
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        The provably optimal 15-man squad under budget alone - no existing squad to
        work around. Solves the real constrained decision (budget, 2 GKP/5 DEF/5 MID/3 FWD,
        max 3 per club) with integer linear programming, not just ranking. Useful for
        Wildcard/Free Hit planning, or building from scratch.
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
            type="number" min={1} max={38}
            value={nextEvent}
            onChange={(e) => setNextEvent(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Window (GWs)
          <input
            type="number" min={1} max={10}
            value={gwCount}
            onChange={(e) => setGwCount(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Budget (£m)
          <input
            type="number" min={80} max={120} step={0.5}
            value={budget / 10}
            onChange={(e) => setBudget(Math.round(Number(e.target.value) * 10))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Solving..." : "Build best squad"}
        </button>
      </form>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {result && (
        <>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            Total cost <span className="font-medium text-black dark:text-zinc-50">£{result.total_cost.toFixed(1)}m</span>
            {" · "}
            Predicted starting XI points <span className="font-medium text-black dark:text-zinc-50">{result.predicted_points.toFixed(2)}</span>
          </p>
          <SquadTable squad={result.squad} />
        </>
      )}
    </div>
  );
}

function TransfersPanel() {
  const [teamId, setTeamId] = useState("");
  const [event, setEvent] = useState(38);
  const [referenceDate, setReferenceDate] = useState("2025-11-30");
  const [nextEvent, setNextEvent] = useState(10);
  const [gwCount, setGwCount] = useState(5);
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [result, setResult] = useState<TransferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/squad/${teamId}/optimize-transfers?event=${event}&reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&free_transfers=${freeTransfers}`
      );
      if (!res.ok) throw new Error(`Request failed (${res.status}) - this manager's picks may not exist for GW${event} anymore`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        Fetches your real squad and bank, then finds the provably optimal set of
        transfers - weighing predicted points gained against the -4 hit for every
        transfer beyond your free ones. Zero transfers is a valid, sometimes-optimal
        answer this can return, not something forced.
      </p>
      <p className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        FPL appears to reset manager pick history at each season boundary, so a
        real, previously-usable team ID may return &quot;not found&quot; right now for a
        2025/26 gameweek - this hasn&apos;t been fully worked around yet.
      </p>
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Team ID
          <input
            type="number"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1234567"
            className="mt-1 w-32 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Squad from GW
          <input
            type="number" min={1} max={38}
            value={event}
            onChange={(e) => setEvent(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
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
            type="number" min={1} max={38}
            value={nextEvent}
            onChange={(e) => setNextEvent(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Window (GWs)
          <input
            type="number" min={1} max={10}
            value={gwCount}
            onChange={(e) => setGwCount(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm text-zinc-600 dark:text-zinc-400">
          Free transfers
          <input
            type="number" min={0} max={5}
            value={freeTransfers}
            onChange={(e) => setFreeTransfers(Number(e.target.value))}
            className="mt-1 w-24 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !teamId}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {loading ? "Solving..." : "Optimize transfers"}
        </button>
      </form>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      {result && (
        <>
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-black dark:text-zinc-50">{result.transfers_made}</span> transfer{result.transfers_made === 1 ? "" : "s"}
            {" · "}
            {result.points_hit > 0 ? (
              <span className="text-red-600 dark:text-red-400">-{result.points_hit} pt hit</span>
            ) : (
              <span>no hit</span>
            )}
            {" · "}
            Predicted XI points (after hit) <span className="font-medium text-black dark:text-zinc-50">{result.predicted_points.toFixed(2)}</span>
          </p>

          {result.transferred_out.length > 0 ? (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Transfer out</p>
                <ul className="text-sm">
                  {result.transferred_out.map((p) => (
                    <li key={p.id} className="border-t border-zinc-200 px-1 py-1.5 dark:border-zinc-800">
                      {p.web_name} <span className="text-zinc-500">({p.team_short}, {p.position})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">Transfer in</p>
                <ul className="text-sm">
                  {result.transferred_in.map((p) => (
                    <li key={p.id} className="border-t border-zinc-200 px-1 py-1.5 dark:border-zinc-800">
                      {p.web_name} <span className="text-zinc-500">({p.team_short}, {p.position})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
              No changes recommended - your squad is already optimal for this window.
            </p>
          )}

          <SquadTable squad={result.squad} />
        </>
      )}
    </div>
  );
}

export default function OptimizerPage() {
  const [mode, setMode] = useState<"best-squad" | "transfers">("best-squad");

  return (
    <main className="min-h-screen bg-zinc-50 p-8 dark:bg-black">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-2xl font-semibold text-black dark:text-zinc-50">
          Squad Optimizer
        </h1>
        <p className="mb-6 text-zinc-600 dark:text-zinc-400">
          Not just a ranking - an integer-linear-programming solver that finds the
          provably optimal squad or transfers under FPL&apos;s real rules.
        </p>

        <div className="mb-6 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setMode("best-squad")}
            className={`px-4 py-2 text-sm font-medium ${
              mode === "best-squad"
                ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                : "text-zinc-500"
            }`}
          >
            Build Best Squad
          </button>
          <button
            onClick={() => setMode("transfers")}
            className={`px-4 py-2 text-sm font-medium ${
              mode === "transfers"
                ? "border-b-2 border-black text-black dark:border-white dark:text-white"
                : "text-zinc-500"
            }`}
          >
            My Transfers
          </button>
        </div>

        {mode === "best-squad" ? <BestSquadPanel /> : <TransfersPanel />}
      </div>
    </main>
  );
}
