"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { Skeleton } from "@/shared/ui/Skeleton";
import { StatBar } from "@/shared/ui/StatBar";
import { TextField } from "@/shared/ui/TextField";
import { FixtureDifficultyTable } from "@/shared/ui/FixtureDifficultyTable";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { getPlayerPool } from "@/shared/api/squad";
import { getFixtureDifficulty } from "@/shared/api/home";
import { TransferPlanBoard } from "./components/TransferPlanBoard";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useTransferPlan } from "./hooks/useTransferPlan";
import type { FixtureDifficultyRow, PoolPlayer } from "@/shared/types/api";

// A radar list of every flagged gameweek is only useful while it's scannable
// - past this, the full points matrix inside the board below is the tool for
// digging further.
const RADAR_LIMIT = 8;

/**
 * The connected team's transfer plan - promoted out of the Inspector rail
 * into its own workspace, alongside "your team" in the squad switcher,
 * because planning ahead needs the context ("who's got a bad gameweek
 * coming", "who's everyone else playing", "what would the model do")
 * standing next to it, not squeezed into a narrow side panel.
 *
 * Loads its own copy of the squad/planner/chips/optimizer data for the
 * connected team - the same four requests LoadTeamPanel makes, just without
 * the pitch, formation editor, and the rest of the dashboard this page
 * doesn't need.
 */
export function TransferPlanWorkspace({ teamId, teamName }: { teamId: number; teamName: string }) {
  const [freeTransfers, setFreeTransfers] = useState(1);
  const { squad: squadRes, optimizer: optimizerRes, planner: plannerRes, chips: chipsRes, load } = useLoadedSquad();

  useEffect(() => {
    load(String(teamId), freeTransfers);
    // Reload only when the team changes - editing the free-transfers field
    // alone shouldn't refire until it's actually changed (see below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const { data, loading, error } = squadRes;
  const { data: optimizer, loading: optimizerLoading } = optimizerRes;
  const { data: planner, loading: plannerLoading, error: plannerError } = plannerRes;
  const { data: chips, loading: chipsLoading } = chipsRes;

  const planWindowEnd = planner ? planner.next_events[planner.next_events.length - 1] : null;
  const {
    entries,
    addingKey,
    error: planError,
    addEntry,
    removeEntry,
    clearAll,
  } = useTransferPlan(planWindowEnd);

  // One pool fetch, shared by the candidate picker inside the board, the
  // recommendation's "Add to plan" cost lookup, and nothing else needs it.
  const [pool, setPool] = useState<PoolPlayer[] | null>(null);
  const [poolLoading, setPoolLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getPlayerPool()
      .then((rows) => {
        if (!cancelled) setPool(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPoolLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // "Which teams are people playing" - every club's run across the same
  // window the plan covers, so a good fixture run (green) reads as a
  // transfer target and a bad one (red) as a reason to move someone on.
  const [fixtureRows, setFixtureRows] = useState<FixtureDifficultyRow[] | null>(null);
  useEffect(() => {
    if (!planner) return;
    let cancelled = false;
    getFixtureDifficulty(planner.next_events[0], planner.next_events.length)
      .then((rows) => {
        if (!cancelled) setFixtureRows(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [planner]);

  const [openPickerFor, setOpenPickerFor] = useState<{ gwEvent: number; outLiveId: number } | null>(null);

  // Squad radar: every flagged gameweek (blank, tough fixture, rotation
  // risk, form dip) for an owned player, soonest first - already-computed
  // server-side (fpl.services.players.player_trajectory_row), just not
  // previously surfaced as its own read anywhere.
  const radar = useMemo(() => {
    if (!planner) return [];
    const rows: {
      event: number;
      id: number;
      web_name: string;
      player_photo: string;
      team_short: string;
      team_badge: string;
      flag: string;
    }[] = [];
    for (const p of planner.players) {
      for (const row of p.trajectory) {
        for (const flag of row.flags) {
          rows.push({
            event: row.event,
            id: p.id,
            web_name: p.web_name,
            player_photo: p.player_photo,
            team_short: p.team_short,
            team_badge: p.team_badge,
            flag,
          });
        }
      }
    }
    return rows.sort((a, b) => a.event - b.event);
  }, [planner]);

  function applyFreeTransfers(raw: string) {
    const value = Math.max(0, Math.min(5, Number(raw)));
    setFreeTransfers(value);
    load(String(teamId), value);
  }

  // The optimizer result useLoadedSquad already fetches (for "Suggested
  // transfers" elsewhere) is exactly "what would the model do right now" -
  // reusing it here means the headline recommendation costs no extra
  // request, and can't disagree with what the rest of the app shows.
  function addRecommended(outId: number, inId: number, targetGw: number) {
    if (!data || !pool) return;
    const original = data.squad.find((p) => p.live_id === outId);
    const candidate = pool.find((p) => p.id === inId);
    if (original?.live_id == null || !candidate) return;
    addEntry(original.live_id, targetGw, candidate);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{teamName}</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Plan transfers for specific future gameweeks - who&apos;s got a rough run, who doesn&apos;t have
            a game at all, and what the model recommends doing about it.
          </p>
        </div>
        <TextField
          label="Free transfers"
          hint="freeTransfers"
          type="number"
          min={0}
          max={5}
          value={freeTransfers}
          onChange={(e) => applyFreeTransfers(e.target.value)}
          wrapperClassName="w-32"
        />
      </div>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try building a squad from scratch instead.
        </p>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <StatBar
            items={[
              {
                label: "In the bank",
                value: `£${data.bank}m`,
                hint: "before anything planned below",
                tooltip: "bankLeft",
              },
              {
                label: "Squad value",
                value: `£${data.squad_value}m`,
                hint: `${data.squad.length} players`,
                tooltip: "squadValue",
              },
              {
                label: "Transfers planned",
                value: entries.length,
                hint:
                  entries.length > 0
                    ? `GW${Math.min(...entries.map((e) => e.gwEvent))}-${Math.max(...entries.map((e) => e.gwEvent))}`
                    : "none yet",
              },
              {
                label: "Planning window",
                value: planner ? `GW${planner.next_events[0]}-${planWindowEnd}` : "-",
                hint: "how far ahead this page looks",
                tooltip: "window",
              },
            ]}
          />

          {/* Proactive, not on-request: the whole point of the data already
              existing server-side is that the model's own pick for right now
              is just here, not behind a button. */}
          <Card className="border-pl-purple/25 bg-pl-purple/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-text-primary">Recommended right now</h3>
              {optimizerLoading && <span className="text-xs text-text-muted">Solving…</span>}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              The model&apos;s pick for your very next transfer window, weighing predicted points against
              the <InfoTooltip term="transferHit" /> -4 hit per transfer beyond your free ones.
            </p>
            {optimizer && optimizer.transferred_out.length === 0 && (
              <div className="mt-3">
                <Alert kind="success">Your squad is already optimal - nothing worth changing right now.</Alert>
              </div>
            )}
            {optimizer && optimizer.transferred_out.length > 0 && (
              <>
                <p className="mt-3 text-sm text-text-secondary">
                  <span className="font-mono font-medium text-text-primary">{optimizer.transfers_made}</span>{" "}
                  transfer{optimizer.transfers_made === 1 ? "" : "s"}
                  {" · "}
                  {optimizer.points_hit > 0 ? (
                    <span className="font-mono text-danger">-{optimizer.points_hit} pt hit</span>
                  ) : (
                    "no hit"
                  )}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {optimizer.transferred_out.map((outP, i) => {
                    const inP = optimizer.transferred_in[i];
                    if (!inP) return null;
                    const original = data.squad.find((p) => p.live_id === outP.id);
                    const targetGw = optimizer.next_event;
                    const already =
                      original?.live_id != null &&
                      entries.some((e) => e.outLiveId === original.live_id && e.gwEvent === targetGw);
                    return (
                      <li
                        key={outP.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <PlayerPhoto
                            src={outP.player_photo}
                            name={outP.web_name}
                            className="h-7 w-7 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                          />
                          <span className="truncate text-text-muted line-through decoration-danger/60">
                            {outP.web_name}
                          </span>
                          <span aria-hidden="true" className="text-text-muted">
                            →
                          </span>
                          <PlayerPhoto
                            src={inP.player_photo}
                            name={inP.web_name}
                            className="h-7 w-7 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-3xs"
                          />
                          <span className="truncate font-medium text-text-primary">{inP.web_name}</span>
                        </div>
                        <button
                          type="button"
                          disabled={already || original?.live_id == null || !pool}
                          onClick={() => addRecommended(outP.id, inP.id, targetGw)}
                          className="shrink-0 rounded-md border border-pl-purple/40 px-2.5 py-1 text-xs font-semibold text-pl-purple hover:bg-pl-purple/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {already ? "Added ✓" : `+ Add to GW${targetGw}`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold text-text-primary">Squad radar</h3>
            <p className="mt-1 text-xs text-text-muted">
              Blank fixtures, tough matchups, rotation risk, and form dips for your own squad across the
              plan window - the moments worth building a transfer around.
            </p>
            {radar.length === 0 ? (
              <p className="mt-3 text-sm text-text-secondary">
                Nothing flagged for your squad in this window.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {radar.slice(0, RADAR_LIMIT).map((r, i) => (
                  <li
                    key={`${r.id}-${r.event}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-sunken/50 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="shrink-0 font-mono text-xs font-semibold text-text-muted">
                        GW{r.event}
                      </span>
                      <PlayerPhoto
                        src={r.player_photo}
                        name={r.web_name}
                        className="h-6 w-6 shrink-0 rounded-full border border-border-strong bg-white object-cover object-top text-3xs"
                      />
                      <span className="font-medium text-text-primary">{r.web_name}</span>
                      <TeamBadge teamShort={r.team_short} name={r.team_short} badgeUrl={r.team_badge} />
                      <span className="text-text-secondary">{r.flag}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenPickerFor({ gwEvent: r.event, outLiveId: r.id })}
                      className="shrink-0 text-xs font-semibold text-pl-purple hover:underline"
                    >
                      Plan a transfer
                    </button>
                  </li>
                ))}
                {radar.length > RADAR_LIMIT && (
                  <li className="pt-1 text-center text-xs text-text-muted">
                    +{radar.length - RADAR_LIMIT} more flagged gameweeks - see the full matrix below
                  </li>
                )}
              </ul>
            )}
          </Card>

          {fixtureRows && planner && (
            <div>
              <h3 className="font-semibold text-text-primary">Who&apos;s playing who</h3>
              <p className="mt-1 text-xs text-text-muted">
                Every club&apos;s run across GW{planner.next_events[0]}-{planWindowEnd}, kindest first - a
                good run (green) is a transfer target; a bad one (red) is a reason to move someone on.
              </p>
              <div className="mt-2">
                <FixtureDifficultyTable rows={fixtureRows} windowSize={planner.next_events.length} />
              </div>
            </div>
          )}

          <TransferPlanBoard
            planner={planner}
            loading={plannerLoading}
            error={plannerError}
            squad={data.squad}
            bank={data.bank}
            freeTransfers={freeTransfers}
            chips={chips}
            chipsLoading={chipsLoading}
            teamId={String(teamId)}
            entries={entries}
            addingKey={addingKey}
            addError={planError}
            onAdd={addEntry}
            onRemove={removeEntry}
            onClearAll={clearAll}
            pool={pool}
            poolLoading={poolLoading}
            openPickerFor={openPickerFor}
            onOpenPickerHandled={() => setOpenPickerFor(null)}
          />
        </div>
      )}
    </div>
  );
}
