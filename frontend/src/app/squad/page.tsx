"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTeam } from "@/components/team/TeamProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, StatTile } from "@/components/ui/Card";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PositionBadge } from "@/components/ui/PositionBadge";
import { TextField } from "@/components/ui/TextField";
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

type Alternative = {
  id: number;
  web_name: string;
  team_short: string;
  cost: number;
  predicted_points: number;
  value: number;
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

  const [suggestFor, setSuggestFor] = useState<{ liveId: number; name: string } | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

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

  async function loadSquad(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await fetchJson(`${API_URL}/api/squad/${id}`));
      loadOptimizer(id); // fires automatically alongside the squad view, not gated on a separate action
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
    <main className="px-4 py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 font-sans text-lg font-bold tracking-tight text-pl-purple">
          My squad
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Enter your team ID - or connect your team once in the sidebar and it loads here automatically.
          Squad analysis and suggested transfers (demo data: GW38, 2025/26).
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
          <p className="mb-4 text-sm font-medium text-danger">{error}</p>
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

            <Card>
              <h3 className="mb-2 font-semibold text-text-primary">
                Suggested transfers
              </h3>
              <p className="mb-3 text-xs text-text-muted">
                Computed automatically from your squad and bank above - the
                provably optimal set of transfers under FPL&apos;s real rules
                (budget, formation, max 3 per club), weighing predicted points
                against the -4 hit per transfer beyond your free ones. See{" "}
                <a href="/optimizer" className="text-pl-purple underline">
                  Optimizer
                </a>{" "}
                for the from-scratch squad builder.
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
                    <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">ep_next</th>
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
                        <TeamBadge teamShort={p.team_short} name={p.team_short} />
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
                        <span className="inline-block rounded-sm border border-border-strong px-2 py-1 text-xs text-text-primary hover:bg-slate-50">
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
                    <span className="font-mono">{c.recommendation_score.toFixed(3)}</span>, ep_next{" "}
                    <span className="font-mono">{c.ep_next}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-text-primary">
                Fixture outlook
              </h3>
              <ul className="space-y-1 text-sm text-text-secondary">
                {data.fixture_outlook.map((f, i) => (
                  <li key={i}>
                    {f.team_short}: score <span className="font-mono">{f.fixture_score}</span> (avg FDR{" "}
                    <span className="font-mono">{f.avg_difficulty}</span>) - {f.ticker}
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
