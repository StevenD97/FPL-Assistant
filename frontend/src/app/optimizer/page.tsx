"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CaptainBadge } from "@/components/ui/CaptainBadge";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TextField } from "@/components/ui/TextField";
import { Alert } from "@/components/ui/Alert";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { fetchJson } from "@/lib/api";

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
                <PlayerLink id={p.id}>{p.web_name}</PlayerLink>
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
      setResult(
        await fetchJson(
          `${API_URL}/api/optimizer/best-squad?reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&budget=${budget}`
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Best 15-man squad under budget, from scratch - ideal for Wildcard/Free Hit planning. Drafts from the live
        2026/27 pool, trained on 2025/26 results.
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
      setResult(
        await fetchJson(
          `${API_URL}/api/squad/${teamId}/optimize-transfers?event=${event}&reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&free_transfers=${freeTransfers}`
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Your real squad and bank, optimally transferred - weighing points gained against the -4 hit per transfer
        beyond your free ones. Zero transfers is a valid answer.
      </p>
      <Alert kind="warning">
        No team ID has a fetchable squad until 2026/27 GW1 locks (2026-08-21) - FPL resets pick history each
        season boundary.
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
                      <PlayerLink id={p.id}>{p.web_name}</PlayerLink>{" "}
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
                      <PlayerLink id={p.id}>{p.web_name}</PlayerLink>{" "}
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
        <h1 className="mb-1 font-sans text-2xl font-bold text-pl-purple">
          Squad optimizer
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          The provably optimal squad or transfers, solved under FPL&apos;s real rules.
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
