"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/components/team/TeamProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, StatTile } from "@/components/ui/Card";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PlayerPhoto } from "@/components/ui/PlayerPhoto";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { SeasonDataNote } from "@/components/ui/SeasonDataNote";
import { TextField } from "@/components/ui/TextField";
import { FdrChip } from "@/components/ui/FdrChip";
import { PitchFormation, type PitchPlayer } from "@/components/pitch/PitchFormation";
import { TeamBadge } from "@/components/pitch/TeamBadge";
import { fetchJson } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SquadPlayer = {
  id: number;
  live_id: number | null;
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
  team_badge: string;
  team_kit: string;
  player_photo: string;
};

type CaptaincyOption = {
  web_name: string;
  team_short: string;
  pos: string;
  recommendation_score: number;
  ep_next: number;
  captain_flag: string;
};

type FixtureOutlookFixture = { opponent: string; is_home: boolean; difficulty: number; opponent_badge: string };

type FixtureOutlookRow = {
  team_short: string;
  team_badge: string;
  fixture_score: number;
  avg_difficulty: number | null;
  ticker: string;
  fixtures: FixtureOutlookFixture[];
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

type Alternative = {
  id: number;
  web_name: string;
  team_short: string;
  cost: number;
  predicted_points: number;
  value: number;
};

type PlannerOpponent = { team: string; is_home: boolean; difficulty: number };

type PlannerGw = {
  event: number;
  predicted_points: number;
  appearance_points: number;
  fixture_count: number;
  opponents: PlannerOpponent[];
  flags: string[];
};

type PlannerPlayer = {
  id: number;
  web_name: string;
  team_short: string;
  position: string;
  team_badge: string;
  player_photo: string;
  average_predicted_points: number;
  trajectory: PlannerGw[];
};

type PlannerResponse = { event: number; next_events: number[]; players: PlannerPlayer[] };

function toPitchPlayer(p: SquadPlayer): PitchPlayer {
  return {
    id: p.id,
    name: p.web_name,
    position: p.pos as PitchPlayer["position"],
    teamShort: p.team_short,
    photo: p.player_photo,
    teamKit: p.team_kit,
    isCaptain: p.captain_flag === "(C)",
    isViceCaptain: p.captain_flag === "(VC)",
    subtitle: p.next_opponent,
    href: p.live_id != null ? `/players/${p.live_id}` : undefined,
  };
}

export function LoadTeamPanel({ onSwitchToOptimize }: { onSwitchToOptimize?: () => void }) {
  const [teamId, setTeamId] = useState("");
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [data, setData] = useState<SquadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [optimizer, setOptimizer] = useState<OptimizerResponse | null>(null);
  const [optimizerLoading, setOptimizerLoading] = useState(false);
  const [optimizerError, setOptimizerError] = useState<string | null>(null);

  const [suggestFor, setSuggestFor] = useState<{ liveId: number; name: string } | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

  const [planner, setPlanner] = useState<PlannerResponse | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);

  // Drag-and-drop "preview a swap": drop a candidate (dragged from the
  // Replacements chips below) onto a planner row to see their trajectory
  // in that slot instead, without making a real transfer. Keyed by the
  // *original* squad player's id (the row/slot being previewed).
  const [swapPreviews, setSwapPreviews] = useState<Record<number, PlannerPlayer>>({});
  const [swapLoading, setSwapLoading] = useState<Record<number, boolean>>({});
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);

  const { teamId: connectedId } = useTeam();

  async function loadAlternatives(liveId: number, name: string) {
    if (suggestFor?.liveId === liveId) {
      setSuggestFor(null);
      setAlternatives(null);
      return;
    }
    setSuggestFor({ liveId, name });
    setAlternatives(null);
    setAlternativesLoading(true);
    try {
      setAlternatives(await fetchJson(`${API_URL}/api/players/${liveId}/alternatives?limit=5`));
    } catch {
      setAlternatives([]);
    } finally {
      setAlternativesLoading(false);
    }
  }

  async function loadOptimizer(id: string) {
    setOptimizerLoading(true);
    setOptimizerError(null);
    setOptimizer(null);
    try {
      setOptimizer(await fetchJson(`${API_URL}/api/squad/${id}/optimize-transfers?free_transfers=${freeTransfers}`));
    } catch (err) {
      // Suggested transfers are a bonus on top of the squad view, not a
      // blocker - if this fails (e.g. FPL's picks-history reset - see
      // README) the squad above still loaded fine, so fail quietly here.
      setOptimizerError(err instanceof Error ? err.message : "Couldn't compute suggested transfers");
    } finally {
      setOptimizerLoading(false);
    }
  }

  async function loadPlanner(id: string) {
    setPlannerLoading(true);
    setPlannerError(null);
    setPlanner(null);
    try {
      setPlanner(await fetchJson(`${API_URL}/api/squad/${id}/planner`));
    } catch (err) {
      // Same "bonus, not a blocker" treatment as suggested transfers below.
      setPlannerError(err instanceof Error ? err.message : "Couldn't build the planner");
    } finally {
      setPlannerLoading(false);
    }
  }

  async function handleSwapDrop(originalPlayerId: number, e: React.DragEvent) {
    e.preventDefault();
    setDragOverRow(null);
    const candidateId = Number(e.dataTransfer.getData("text/plain"));
    if (!candidateId || !planner) return;
    setSwapLoading((prev) => ({ ...prev, [originalPlayerId]: true }));
    try {
      const gwCount = planner.next_events.length;
      const nextEvent = planner.next_events[0];
      const row = await fetchJson<PlannerPlayer>(
        `${API_URL}/api/players/${candidateId}/trajectory?gw_count=${gwCount}&next_event=${nextEvent}`
      );
      setSwapPreviews((prev) => ({ ...prev, [originalPlayerId]: row }));
    } catch {
      // Dropping an invalid/unfetchable candidate just does nothing - not worth a page-level error.
    } finally {
      setSwapLoading((prev) => ({ ...prev, [originalPlayerId]: false }));
    }
  }

  function undoSwap(originalPlayerId: number) {
    setSwapPreviews((prev) => {
      const next = { ...prev };
      delete next[originalPlayerId];
      return next;
    });
  }

  async function loadSquad(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await fetchJson(`${API_URL}/api/squad/${id}`));
      loadOptimizer(id); // fires automatically alongside the squad view, not gated on a separate action
      loadPlanner(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    loadSquad(teamId);
  }

  // If a team is connected via the sidebar, prefill the field and load it
  // automatically - no need to re-type the ID on this page.
  useEffect(() => {
    if (connectedId != null) {
      setTeamId(String(connectedId));
      loadSquad(String(connectedId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedId]);

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-6 text-sm text-text-secondary">
        Enter your team ID, or connect your team in the sidebar to load it automatically.{" "}
        <SeasonDataNote mode="archived" />
      </p>
      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3">
        <TextField
          label="Team ID"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          placeholder="e.g. 1178869"
        />
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
          {loading ? "Loading..." : "Load squad"}
        </Button>
      </form>

      {error && (
        <p className="mb-4 text-sm font-medium text-danger">
          {error} - no picks yet for this team? Try{" "}
          <span className="font-semibold text-text-primary">Build from scratch</span> above instead.
        </p>
      )}

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
        </div>
      )}
    </div>
  );
}
