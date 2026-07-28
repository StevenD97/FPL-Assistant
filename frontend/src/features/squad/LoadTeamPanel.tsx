"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/shared/team/TeamProvider";
import { Alert } from "@/shared/ui/Alert";
import { Button } from "@/shared/ui/Button";
import { Card, StatTile } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { Skeleton } from "@/shared/ui/Skeleton";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { SeasonDataNote } from "@/shared/ui/SeasonDataNote";
import { TextField } from "@/shared/ui/TextField";
import { FdrChip } from "@/shared/ui/FdrChip";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { SquadPlayer } from "@/shared/types/api";
import { useAlternatives } from "./hooks/useAlternatives";
import { useLoadedSquad } from "./hooks/useLoadedSquad";
import { useSwapPreview } from "./hooks/useSwapPreview";


function toPitchPlayer(p: SquadPlayer): PitchPlayer {
  return {
    id: p.id,
    name: p.web_name,
    position: p.pos,
    teamShort: p.team_short,
    photo: p.player_photo,
    teamKit: p.team_kit,
    isCaptain: p.captain_flag === "(C)",
    isViceCaptain: p.captain_flag === "(VC)",
    subtitle: p.next_opponent,
    href: p.live_id != null ? `/players/${p.live_id}` : undefined,
  };
}

// Stand-in for the loaded squad view: summary lines, the pitch, a bench
// strip, and the two panels (suggested transfers + planner table) below it.
function SquadViewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div>
        <Skeleton className="h-[360px] w-full rounded-lg" />
        <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

export function LoadTeamPanel({
  onSwitchToOptimize,
  initialTeamId,
  embedded = false,
}: {
  onSwitchToOptimize?: () => void;
  /** When set (workspace mode), load this exact team instead of the connected one. */
  initialTeamId?: number;
  /** Workspace mode: the switcher labels the team, so hide the intro + team-ID input. */
  embedded?: boolean;
}) {
  const [teamId, setTeamId] = useState("");
  const [freeTransfers, setFreeTransfers] = useState(1);
  const { teamId: connectedId } = useTeam();

  const {
    squad: squadRes,
    optimizer: optimizerRes,
    planner: plannerRes,
    chips: chipsRes,
    load,
  } = useLoadedSquad();
  const {
    suggestFor,
    alternatives,
    loading: alternativesLoading,
    toggle: loadAlternatives,
  } = useAlternatives();
  const {
    previews: swapPreviews,
    loading: swapLoading,
    dragOverRow,
    setDragOverRow,
    drop: handleSwapDrop,
    undo: undoSwap,
  } = useSwapPreview(plannerRes.data);

  // Flattened so the markup below reads the same as it did when all of this was
  // local state - the render output is unchanged, only where the values come
  // from has moved.
  const { data, loading, error } = squadRes;
  const { data: optimizer, loading: optimizerLoading, error: optimizerError } = optimizerRes;
  const { data: planner, loading: plannerLoading, error: plannerError } = plannerRes;
  const { data: chips, loading: chipsLoading, error: chipsError } = chipsRes;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    load(teamId, freeTransfers);
  }

  // Which team this panel should show: an explicit workspace selection wins,
  // otherwise fall back to the team connected via the sidebar. Prefill the
  // field and load it automatically - no need to re-type the ID.
  const activeId = initialTeamId ?? connectedId ?? null;
  useEffect(() => {
    if (activeId != null) {
      setTeamId(String(activeId));
      load(String(activeId), freeTransfers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div>
      {!embedded && (
        <p className="mb-6 text-sm text-text-secondary">
          Enter your team ID, or connect your team in the sidebar to load it automatically.{" "}
          <SeasonDataNote mode="archived" />
        </p>
      )}
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
        {!embedded && (
          <TextField
            label="Team ID"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            placeholder="e.g. 1178869"
          />
        )}
        <TextField
          label="Free transfers"
          type="number"
          min={0}
          max={5}
          value={freeTransfers}
          onChange={(e) => setFreeTransfers(Number(e.target.value))}
          wrapperClassName="w-28"
        />
        <Button type="submit" disabled={loading || !teamId}>
          {loading ? "Loading..." : embedded ? "Reload" : "Load squad"}
        </Button>
      </form>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try{" "}
          <span className="font-semibold text-text-primary">Build from scratch</span> above instead.
        </p>
      )}

      {loading && !data && <SquadViewSkeleton />}

      {data && (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {data.entry_name} - GW{data.event}
            </h2>
            <p className="text-text-secondary">
              <span className="font-mono">{data.points}</span> points that GW - £
              <span className="font-mono">{data.squad_value}</span>m squad
              value - £<span className="font-mono">{data.bank}</span>m in bank
            </p>
          </div>

          <div>
            <PitchFormation
              players={data.squad.filter((p) => p.role === "Starting XI").map(toPitchPlayer)}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-4 rounded-lg border border-border bg-surface-sunken px-4 py-3">
              <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:w-auto sm:text-left">
                Bench
              </span>
              {data.squad
                .filter((p) => p.role !== "Starting XI")
                .map((p) => (
                  <PlayerLink key={p.id} id={p.live_id} className="flex flex-col items-center gap-1 text-center">
                    <PlayerPhoto
                      src={p.player_photo}
                      name={p.web_name}
                      className="h-10 w-10 rounded-full border-2 border-border-strong bg-white object-cover object-top text-[10px]"
                    />
                    <span className="whitespace-nowrap text-[11px] font-medium text-text-primary">{p.web_name}</span>
                  </PlayerLink>
                ))}
            </div>
          </div>

          <Card>
            <h3 className="mb-2 font-semibold text-text-primary">
              Suggested transfers
            </h3>
            <p className="mb-3 text-xs text-text-muted">
              The optimal transfers for your squad and bank, weighing predicted points against the -4 hit per
              transfer beyond your free ones.{" "}
              {onSwitchToOptimize && (
                <>
                  See the{" "}
                  <button type="button" onClick={onSwitchToOptimize} className="text-pl-purple underline">
                    Optimizer
                  </button>{" "}
                  tab for a from-scratch solve, or full control over the prediction window.
                </>
              )}
            </p>

            {optimizerLoading && (
              <p className="text-sm text-text-muted">Solving...</p>
            )}

            {optimizerError && (
              <Alert kind="warning">
                Couldn&apos;t compute suggested transfers ({optimizerError}) - the squad
                above is unaffected.
              </Alert>
            )}

            {optimizer && (
              <>
                <p className="mb-3 text-sm text-text-secondary">
                  <span className="font-mono font-medium text-text-primary">{optimizer.transfers_made}</span>{" "}
                  transfer{optimizer.transfers_made === 1 ? "" : "s"}
                  {" · "}
                  {optimizer.points_hit > 0 ? (
                    <span className="font-mono text-danger">
                      -{optimizer.points_hit} pt hit
                    </span>
                  ) : (
                    <span>no hit</span>
                  )}
                  {" · "}
                  predicted XI points (after hit){" "}
                  <span className="font-mono font-medium text-text-primary">
                    {optimizer.predicted_points.toFixed(2)}
                  </span>
                </p>

                {optimizer.transferred_out.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                        Out
                      </p>
                      <ul className="text-sm">
                        {optimizer.transferred_out.map((p) => (
                          <li key={p.id} className="border-t border-border py-1">
                            {p.web_name}{" "}
                            <span className="text-text-muted">
                              ({p.team_short}, {p.position})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                        In
                      </p>
                      <ul className="text-sm">
                        {optimizer.transferred_in.map((p) => (
                          <li key={p.id} className="border-t border-border py-1">
                            {p.web_name}{" "}
                            <span className="text-text-muted">
                              ({p.team_short}, {p.position})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <Alert kind="success">
                    No changes recommended - your squad is already optimal for this window.
                  </Alert>
                )}
              </>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="border-b border-border p-4">
              <h3 className="font-semibold text-text-primary">Transfer planner</h3>
              <p className="mt-1 text-xs text-text-muted">
                Predicted points per gameweek for your squad, with risky weeks flagged - tough fixtures, blanks,
                or rotation risk. Hover a flagged cell for why, or drag a replacement chip onto a row to preview
                a swap.
              </p>
            </div>
            {plannerLoading && <p className="p-4 text-sm text-text-muted">Building planner...</p>}
            {plannerError && (
              <div className="p-4">
                <Alert kind="warning">Couldn&apos;t build the planner ({plannerError}).</Alert>
              </div>
            )}
            {planner && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-sunken">
                    <tr>
                      <th className="sticky left-0 bg-surface-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        Player
                      </th>
                      {planner.next_events.map((gw) => (
                        <th
                          key={gw}
                          className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-text-muted"
                        >
                          GW{gw}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planner.players.map((original) => {
                      const preview = swapPreviews[original.id];
                      const display = preview ?? original;
                      const isPreviewing = preview != null;
                      return (
                        <tr
                          key={original.id}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverRow(original.id);
                          }}
                          onDragLeave={() => setDragOverRow((cur) => (cur === original.id ? null : cur))}
                          onDrop={(e) => handleSwapDrop(original.id, e)}
                          className={`border-t border-border transition-colors duration-fast ease-standard ${
                            isPreviewing ? "bg-pl-purple/5" : ""
                          } ${dragOverRow === original.id ? "outline outline-2 -outline-offset-2 outline-pl-purple" : ""}`}
                        >
                          <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              <PlayerLink id={display.id} className="flex items-center gap-2">
                                <PlayerPhoto
                                  src={display.player_photo}
                                  name={display.web_name}
                                  className="h-7 w-7 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-[8px]"
                                />
                                <span>
                                  {display.web_name} <span className="text-text-muted">({display.team_short})</span>
                                </span>
                              </PlayerLink>
                              {swapLoading[original.id] && (
                                <span className="text-xs text-text-muted">loading...</span>
                              )}
                              {isPreviewing && (
                                <button
                                  onClick={() => undoSwap(original.id)}
                                  className="rounded-sm border border-pl-purple/40 px-1.5 py-0.5 text-[10px] font-semibold text-pl-purple hover:bg-pl-purple/10"
                                  title={`Stop previewing - show ${original.web_name} again`}
                                >
                                  ↩ was {original.web_name}
                                </button>
                              )}
                            </div>
                          </td>
                          {display.trajectory.map((gw) => {
                            const hasBlank = gw.fixture_count === 0;
                            const hasFlag = gw.flags.length > 0;
                            const bg = hasBlank ? "bg-danger-bg" : hasFlag ? "bg-warning-bg" : "";
                            return (
                              <td
                                key={gw.event}
                                className={`px-3 py-2 text-center font-mono ${bg}`}
                                title={gw.flags.length > 0 ? gw.flags.join(" · ") : undefined}
                              >
                                {gw.predicted_points.toFixed(1)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-sunken">
                <tr>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Player</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Team</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Pos</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Role</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Score</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Next opp</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">EP next</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">xGI</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">ICT</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Def/90</th>
                  <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Set-piece duty</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {data.squad.map((p) => (
                  <tr key={p.position} className="border-t border-border">
                    <td className="px-3 py-2.5 font-medium">
                      <PlayerLink id={p.live_id}>{p.web_name}</PlayerLink> {p.captain_flag}
                    </td>
                    <td className="px-3 py-2.5">
                      <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
                    </td>
                    <td className="px-3 py-2.5">
                      <PositionBadge position={p.pos} />
                    </td>
                    <td className="px-3 py-2.5">{p.role}</td>
                    <td className="px-3 py-2.5 font-mono">
                      {p.recommendation_score.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5">{p.next_opponent}</td>
                    <td className="px-3 py-2.5 font-mono">{p.ep_next}</td>
                    <td className="px-3 py-2.5 font-mono">{p.expected_goal_involvements}</td>
                    <td className="px-3 py-2.5 font-mono">{p.ict_index}</td>
                    <td className="px-3 py-2.5 font-mono">{p.defensive_contribution_per_90}</td>
                    <td className="px-3 py-2.5 font-mono">{p.set_piece_duty_score.toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      {p.live_id != null && (
                        <button
                          onClick={() => loadAlternatives(p.live_id!, p.web_name)}
                          className="text-xs text-pl-purple hover:underline"
                        >
                          {suggestFor?.liveId === p.live_id ? "Hide" : "Suggest"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {suggestFor && (
            <Card>
              <h3 className="mb-3 font-semibold text-text-primary">
                Replacements for {suggestFor.name}
              </h3>
              {alternativesLoading ? (
                <p className="text-sm text-text-muted">Loading...</p>
              ) : alternatives && alternatives.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {alternatives.map((a) => (
                    <PlayerLink key={a.id} id={a.id}>
                      <span
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(a.id))}
                        className="inline-block cursor-grab rounded-sm border border-border-strong px-2 py-1 text-xs text-text-primary hover:bg-slate-50 active:cursor-grabbing"
                        title="Drag onto a Transfer planner row to preview swapping them in"
                      >
                        {a.web_name} ({a.team_short}, £{a.cost.toFixed(1)}m, {a.predicted_points.toFixed(1)} pts)
                      </span>
                    </PlayerLink>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No alternatives found.</p>
              )}
            </Card>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Object.entries(data.category_scores).map(([pos, score]) => (
              <StatTile key={pos} label={pos} value={score.toFixed(3)} />
            ))}
            <StatTile label="Bench depth" value={data.bench_depth_score?.toFixed(3) ?? "-"} />
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-text-primary">
              Captaincy options
            </h3>
            <ul className="space-y-1 text-sm text-text-secondary">
              {data.captaincy_options.map((c, i) => (
                <li key={i}>
                  {c.web_name} ({c.team_short}, {c.pos}) - score{" "}
                  <span className="font-mono">{c.recommendation_score.toFixed(3)}</span>, EP next{" "}
                  <span className="font-mono">{c.ep_next}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-text-primary">
              Fixture outlook
            </h3>
            <ul className="space-y-1.5 text-sm text-text-secondary">
              {data.fixture_outlook.map((f, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <TeamBadge teamShort={f.team_short} name={f.team_short} badgeUrl={f.team_badge} />
                  <span>
                    score <span className="font-mono">{f.fixture_score}</span> (avg FDR{" "}
                    <span className="font-mono">{f.avg_difficulty}</span>)
                  </span>
                  {f.fixtures.map((fx, fi) => (
                    <FdrChip
                      key={fi}
                      opponent={fx.opponent}
                      isHome={fx.is_home}
                      difficulty={fx.difficulty}
                      badgeUrl={fx.opponent_badge}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </div>

          {/* Chip strategy - folded in from the old standalone /chips page so
              it lives with the team it's about. */}
          <div>
            <h3 className="mb-1 font-semibold text-text-primary">Chip strategy</h3>
            <p className="mb-3 text-xs text-text-muted">
              Suggested timing for Bench Boost, Triple Captain, Free Hit, and Wildcard across the next run.
            </p>
            {chipsLoading && <p className="text-sm text-text-muted">Scanning chip timing…</p>}
            {chipsError && (
              <Alert kind="warning">Couldn&apos;t scan chip timing ({chipsError}) - the squad above is unaffected.</Alert>
            )}
            {chips && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Bench Boost</p>
                  <p className="mt-1 text-md font-bold text-pl-purple">GW{chips.bench_boost.event}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    bench <span className="font-mono">{chips.bench_boost.bench_score.toFixed(2)}</span> ·{" "}
                    {chips.bench_boost.double_count} DGW
                  </p>
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Triple Captain</p>
                  <p className="mt-1 text-md font-bold text-pl-purple">GW{chips.triple_captain.event}</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {chips.triple_captain.player} ·{" "}
                    <span className="font-mono">{chips.triple_captain.score.toFixed(2)}</span>
                  </p>
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Free Hit</p>
                  {chips.free_hit.recommended ? (
                    <>
                      <p className="mt-1 text-md font-bold text-pl-purple">GW{chips.free_hit.event}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">{chips.free_hit.blank_count} of 15 blank</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-text-secondary">No strong case - hold it</p>
                  )}
                </Card>
                <Card>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Wildcard</p>
                  {chips.wildcard ? (
                    <>
                      <p className="mt-1 text-md font-bold text-pl-purple">~GW{chips.wildcard.suggested_event}</p>
                      <p className="mt-0.5 text-xs text-text-secondary">{chips.wildcard.reason}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-text-secondary">No major cluster found</p>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
