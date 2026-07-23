"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CaptainBadge } from "@/components/ui/CaptainBadge";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { Alert } from "@/components/ui/Alert";
import { TeamBadge } from "@/components/pitch/TeamBadge";

type SquadRow = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  predicted_points: number;
  value: number;
  selected_by_percent: number;
  status: string;
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
  value: number;
  selected_by_percent: number;
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
    <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-sunken">
          <tr>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Role</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Cost</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Predicted pts</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Value</th>
            <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Own%</th>
          </tr>
        </thead>
        <tbody>
          {sortSquad(squad).map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-3 py-2.5 text-text-muted">{p.role === "Starting XI" ? "XI" : "Bench"}</td>
              <td className="px-3 py-2.5 font-medium">
                {p.web_name}
                {p.captain && <CaptainBadge />}
                <StatusBadge status={p.status} />
              </td>
              <td className="px-3 py-2.5">
                <TeamBadge teamShort={p.team_short} name={p.team_short} />
              </td>
              <td className="px-3 py-2.5">
                <PositionBadge position={p.position} />
              </td>
              <td className="px-3 py-2.5 font-mono">£{p.cost.toFixed(1)}m</td>
              <td className="px-3 py-2.5 font-mono font-medium">{p.predicted_points.toFixed(2)}</td>
              <td className="px-3 py-2.5 font-mono">{p.value.toFixed(2)}</td>
              <td className="px-3 py-2.5 font-mono">{p.selected_by_percent.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BestSquadPanel() {
  const [referenceDate, setReferenceDate] = useState("2026-08-20");
  const [nextEvent, setNextEvent] = useState(1);
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
      <p className="mb-2 max-w-2xl text-text-secondary">
        The provably optimal 15-man squad under budget alone - no existing squad to
        work around. Solves the real constrained decision (budget, 2 GKP/5 DEF/5 MID/3 FWD,
        max 3 per club) with integer linear programming, not just ranking. Useful for
        Wildcard/Free Hit planning, or building from scratch.
      </p>
      <p className="mb-6 text-sm text-text-muted">
        Drafts from the live 2026/27 player pool and prices - trained on last
        season&apos;s (2025/26) results, since no 2026/27 match data exists yet.
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
          onChange={(e) => setNextEvent(Number(e.target.value))}
          wrapperClassName="w-24"
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
          label="Budget (£m)"
          type="number"
          min={80}
          max={120}
          step={0.5}
          value={budget / 10}
          onChange={(e) => setBudget(Math.round(Number(e.target.value) * 10))}
          wrapperClassName="w-24"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Solving..." : "Build best squad"}
        </Button>
      </form>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">{error}</p>
      )}

      {result && (
        <>
          <p className="mb-4 text-sm text-text-secondary">
            Total cost <span className="font-mono font-medium text-text-primary">£{result.total_cost.toFixed(1)}m</span>
            {" · "}
            Predicted starting XI points{" "}
            <span className="font-mono font-medium text-text-primary">{result.predicted_points.toFixed(2)}</span>
          </p>
          <SquadTable squad={result.squad} />
        </>
      )}
    </div>
  );
}

function TransfersPanel() {
  const [teamId, setTeamId] = useState("");
  const [event, setEvent] = useState(1);
  const [referenceDate, setReferenceDate] = useState("2026-08-20");
  const [nextEvent, setNextEvent] = useState(1);
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
      <p className="mb-6 max-w-2xl text-text-secondary">
        Fetches your real squad and bank, then finds the provably optimal set of
        transfers - weighing predicted points gained against the -4 hit for every
        transfer beyond your free ones. Zero transfers is a valid, sometimes-optimal
        answer this can return, not something forced.
      </p>
      <Alert kind="warning">
        FPL appears to reset manager pick history at each season boundary, so a
        squad only exists for a gameweek once that gameweek&apos;s deadline has
        passed. 2026/27 GW1 locks 2026-08-21 - until then, no team ID has a
        fetchable squad here yet.
      </Alert>
      <form onSubmit={handleSubmit} className="mb-6 mt-6 flex flex-wrap items-end gap-4">
        <TextField
          label="Team ID"
          type="number"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="e.g. 1234567"
          wrapperClassName="w-32"
        />
        <TextField
          label="Squad from GW"
          type="number"
          min={1}
          max={38}
          value={event}
          onChange={(e) => setEvent(Number(e.target.value))}
          wrapperClassName="w-24"
        />
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
          onChange={(e) => setNextEvent(Number(e.target.value))}
          wrapperClassName="w-24"
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
          label="Free transfers"
          type="number"
          min={0}
          max={5}
          value={freeTransfers}
          onChange={(e) => setFreeTransfers(Number(e.target.value))}
          wrapperClassName="w-24"
        />
        <Button type="submit" disabled={loading || !teamId}>
          {loading ? "Solving..." : "Optimize transfers"}
        </Button>
      </form>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">{error}</p>
      )}

      {result && (
        <>
          <p className="mb-4 text-sm text-text-secondary">
            <span className="font-mono font-medium text-text-primary">{result.transfers_made}</span> transfer{result.transfers_made === 1 ? "" : "s"}
            {" · "}
            {result.points_hit > 0 ? (
              <span className="font-mono text-danger">-{result.points_hit} pt hit</span>
            ) : (
              <span>no hit</span>
            )}
            {" · "}
            Predicted XI points (after hit){" "}
            <span className="font-mono font-medium text-text-primary">{result.predicted_points.toFixed(2)}</span>
          </p>

          {result.transferred_out.length > 0 ? (
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">Transfer out</p>
                <ul className="text-sm">
                  {result.transferred_out.map((p) => (
                    <li key={p.id} className="border-t border-border px-1 py-1.5">
                      {p.web_name}{" "}
                      <span className="text-text-muted">
                        ({p.team_short}, {p.position}, value {p.value.toFixed(2)}, {p.selected_by_percent.toFixed(1)}% owned)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-text-secondary">Transfer in</p>
                <ul className="text-sm">
                  {result.transferred_in.map((p) => (
                    <li key={p.id} className="border-t border-border px-1 py-1.5">
                      {p.web_name}{" "}
                      <span className="text-text-muted">
                        ({p.team_short}, {p.position}, value {p.value.toFixed(2)}, {p.selected_by_percent.toFixed(1)}% owned)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mb-6 text-sm text-text-secondary">
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
    <main className="min-h-screen bg-white p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 font-sans text-2xl font-bold text-pl-purple">
          Squad optimizer
        </h1>
        <p className="mb-6 text-text-secondary">
          Not just a ranking - an integer-linear-programming solver that finds the
          provably optimal squad or transfers under FPL&apos;s real rules.
        </p>

        <div className="mb-6 flex gap-2 border-b border-border">
          <button
            onClick={() => setMode("best-squad")}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-base ease-standard ${
              mode === "best-squad"
                ? "border-b-2 border-pl-purple text-pl-purple"
                : "border-b-2 border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Build Best Squad
          </button>
          <button
            onClick={() => setMode("transfers")}
            className={`px-4 py-2 text-sm font-medium transition-colors duration-base ease-standard ${
              mode === "transfers"
                ? "border-b-2 border-pl-purple text-pl-purple"
                : "border-b-2 border-transparent text-text-muted hover:text-text-primary"
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
