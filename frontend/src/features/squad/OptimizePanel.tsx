"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/Button";
import { TableFrame, Th } from "@/shared/ui/Table";
import { CaptainBadge } from "@/shared/ui/CaptainBadge";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { useSeasonStatus } from "@/shared/lib/useSeasonStatus";
import { TextField } from "@/shared/ui/TextField";
import { Alert } from "@/shared/ui/Alert";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { apiGet } from "@/shared/lib/api";
import type { BestSquadResult, SquadRow, TransferResult } from "@/shared/types/api";

const POSITION_ORDER = ["GKP", "DEF", "MID", "FWD"];

function sortSquad(squad: SquadRow[]): SquadRow[] {
  return [...squad].sort((a, b) => {
    if (a.role !== b.role) return a.role === "Starting XI" ? -1 : 1;
    return POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position);
  });
}

function toPitchPlayer(p: SquadRow): PitchPlayer {
  return {
    id: p.id,
    name: p.web_name,
    position: p.position as PitchPlayer["position"],
    teamShort: p.team_short,
    photo: p.player_photo,
    teamKit: p.team_kit,
    isCaptain: p.captain,
    href: `/players/${p.id}`,
  };
}

function IdealXI({ squad }: { squad: SquadRow[] }) {
  const xi = squad.filter((p) => p.role === "Starting XI");
  const bench = squad.filter((p) => p.role !== "Starting XI");
  return (
    <div>
      <PitchFormation players={xi.map(toPitchPlayer)} />
      <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <span className="w-full text-center text-xs font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
          Bench
        </span>
        {bench.map((p) => (
          <PlayerLink key={p.id} id={p.id} className="flex flex-col items-center gap-1 text-center">
            <PlayerPhoto
              src={p.player_photo}
              name={p.web_name}
              className="h-10 w-10 rounded-full border-2 border-border-strong bg-surface object-cover object-top text-xs"
            />
            <span className="whitespace-nowrap text-xs font-medium text-text-primary">{p.web_name}</span>
          </PlayerLink>
        ))}
      </div>
    </div>
  );
}

/**
 * The solved squad's per-player numbers. Deliberately narrow: the pitch above
 * (`IdealXI`) already shows who's in, their club, position, captaincy and
 * XI-vs-bench, so this used to repeat all of that across eight columns. Team,
 * position and role are dropped as duplicates of the pitch; value and ownership
 * move into a per-row expansion, so nothing is lost from the solve.
 */
function SquadTable({ squad }: { squad: SquadRow[] }) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  return (
    <TableFrame>
      <thead className="bg-surface-sunken">
        <tr>
          <Th>Player</Th>
          <Th>Cost</Th>
          <Th>
            <span className="inline-flex items-center gap-1">
              Predicted pts <InfoTooltip term="xPts" />
            </span>
          </Th>
          <Th>
            <span className="sr-only">Details</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {sortSquad(squad).map((p) => {
          const expanded = openRow === p.id;
          return (
            <Fragment key={p.id}>
              <tr className="border-t border-border">
                <td className="cell-primary px-3 py-2.5">
                  <PlayerLink id={p.id}>{p.web_name}</PlayerLink>
                  {p.captain && <CaptainBadge />}
                  <StatusBadge status={p.status} />
                </td>
                <td data-label="Cost" className="px-3 py-2.5 font-mono">
                  £{p.cost.toFixed(1)}m
                </td>
                <td data-label="Predicted pts" className="px-3 py-2.5 font-mono font-medium">
                  {p.predicted_points.toFixed(2)}
                </td>
                <td data-label="Detail" className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenRow(expanded ? null : p.id)}
                    aria-expanded={expanded}
                    className="tap-target inline-flex items-center text-xs font-semibold text-text-primary hover:underline"
                  >
                    {expanded ? "Hide" : "More"}
                  </button>
                </td>
              </tr>
              {expanded && (
                <tr className="border-t border-border bg-surface-sunken/60">
                  <td className="cell-detail px-3 pb-3 pt-1" colSpan={4}>
                    <dl className="flex flex-wrap gap-x-6 gap-y-2">
                      <OptStat label="Role" value={p.role === "Starting XI" ? "XI" : "Bench"} term="role" />
                      <OptStat label="Value" value={p.value.toFixed(2)} term="value" />
                      <OptStat
                        label="Own%"
                        value={`${p.selected_by_percent.toFixed(1)}%`}
                        term="ownership"
                      />
                    </dl>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </TableFrame>
  );
}

function OptStat({
  label,
  value,
  term,
}: {
  label: string;
  value: React.ReactNode;
  term: Parameters<typeof InfoTooltip>[0]["term"];
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label} <InfoTooltip term={term} />
      </dt>
      <dd className="font-mono text-sm text-text-primary">{value}</dd>
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
  const status = useSeasonStatus();

  const seededFromStatus = useRef(false);
  useEffect(() => {
    if (!status || seededFromStatus.current) return;
    seededFromStatus.current = true;
    setNextEvent(status.next_event);
    setReferenceDate(status.next_deadline.slice(0, 10));
  }, [status]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(
        await apiGet<BestSquadResult>(
          `/api/optimizer/best-squad?reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&budget=${budget}`
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
        The optimal 15-man squad under budget, built from scratch - ideal for Wildcard or Free Hit planning.{" "}
        <SeasonDataNote mode="blended" />
      </p>
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-4">
        <TextField
          label="As of"
          hint="asOf"
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
          hint="window"
          type="number"
          min={1}
          max={10}
          value={gwCount}
          onChange={(e) => setGwCount(Number(e.target.value))}
          wrapperClassName="w-24"
        />
        <TextField
          label="Budget (£m)"
          hint="budget"
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
        <div className="space-y-6">
          <p className="text-sm text-text-secondary">
            Total cost <span className="font-mono font-medium text-text-primary">£{result.total_cost.toFixed(1)}m</span>
            {" · "}
            Predicted starting XI points{" "}
            <span className="font-mono font-medium text-text-primary">{result.predicted_points.toFixed(2)}</span>
            <InfoTooltip term="xPts" />
          </p>
          <IdealXI squad={result.squad} />
          <SquadTable squad={result.squad} />
        </div>
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
  const status = useSeasonStatus();

  // Seed the form from the real current gameweek once season status loads,
  // instead of leaving the GW1 placeholder defaults in place once the
  // season has actually moved on - only once, so it doesn't clobber a
  // manual edit made before the fetch lands.
  const seededFromStatus = useRef(false);
  useEffect(() => {
    if (!status || seededFromStatus.current) return;
    seededFromStatus.current = true;
    setEvent(Math.max(1, status.next_event - 1));
    setNextEvent(status.next_event);
    setReferenceDate(status.next_deadline.slice(0, 10));
  }, [status]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await apiGet<TransferResult>(
          `/api/squad/${teamId}/optimize-transfers?event=${event}&reference_date=${referenceDate}&next_event=${nextEvent}&gw_count=${gwCount}&free_transfers=${freeTransfers}`
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
        beyond your free ones. For a quicker version with no input needed, see the automatic &quot;Suggested
        transfers&quot; under Load my team; this panel adds full control over the prediction window and
        gameweek.
      </p>
      {status?.is_preseason !== false && (
        <Alert kind="warning">
          No team ID has a fetchable squad until {status?.current_season_label ?? "2026/27"} GW1 locks
          {status?.next_deadline ? ` (${status.next_deadline.slice(0, 10)})` : ""} - FPL resets pick history each
          season boundary.
        </Alert>
      )}
      <form onSubmit={handleSubmit} className="mb-6 mt-6 flex flex-wrap items-end gap-4">
        <TextField
          label="Team ID"
          hint="teamId"
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
          hint="asOf"
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
          hint="window"
          type="number"
          min={1}
          max={10}
          value={gwCount}
          onChange={(e) => setGwCount(Number(e.target.value))}
          wrapperClassName="w-24"
        />
        <TextField
          label="Free transfers"
          hint="freeTransfers"
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
        <div className="space-y-6">
          <p className="text-sm text-text-secondary">
            <span className="font-mono font-medium text-text-primary">{result.transfers_made}</span> transfer{result.transfers_made === 1 ? "" : "s"}
            {" · "}
            {result.points_hit > 0 ? (
              <span className="inline-flex items-center gap-1 font-mono text-danger">
                -{result.points_hit} pt hit <InfoTooltip term="transferHit" />
              </span>
            ) : (
              <span>no hit</span>
            )}
            {" · "}
            Predicted XI points (after hit){" "}
            <span className="font-mono font-medium text-text-primary">{result.predicted_points.toFixed(2)}</span>
            {" · "}
            Squad cost <span className="font-mono font-medium text-text-primary">£{result.total_cost.toFixed(1)}m</span>
            {" · "}
            Bank left <span className="font-mono font-medium text-text-primary">£{result.bank.toFixed(1)}m</span>
            <InfoTooltip term="bankLeft" />
            {" of "}
            <span className="font-mono font-medium text-text-primary">
              £{(result.total_cost + result.bank).toFixed(1)}m
            </span>{" "}
            available
          </p>

          {result.transferred_out.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="text-sm text-text-secondary">
              No changes recommended - your squad is already optimal for this window.
            </p>
          )}

          <IdealXI squad={result.squad} />
          <SquadTable squad={result.squad} />
        </div>
      )}
    </div>
  );
}

export function OptimizePanel() {
  const [subMode, setSubMode] = useState<"best-squad" | "transfers">("best-squad");

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mb-6 text-sm text-text-secondary">
        The optimal squad or transfers under FPL&apos;s real rules - budget, formation, max 3 per club - solved
        exactly, not just ranked.
      </p>

      <div className="mb-6 flex gap-2 border-b border-border">
        <button
          onClick={() => setSubMode("best-squad")}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-base ease-standard ${
            subMode === "best-squad"
              ? "border-b-2 border-brand text-text-primary"
              : "border-b-2 border-transparent text-text-muted hover:text-text-primary"
          }`}
        >
          Build Best Squad
        </button>
        <button
          onClick={() => setSubMode("transfers")}
          className={`px-4 py-2 text-sm font-medium transition-colors duration-base ease-standard ${
            subMode === "transfers"
              ? "border-b-2 border-brand text-text-primary"
              : "border-b-2 border-transparent text-text-muted hover:text-text-primary"
          }`}
        >
          My Transfers
        </button>
      </div>

      {subMode === "best-squad" ? <BestSquadPanel /> : <TransfersPanel />}
    </div>
  );
}
