"use client";

import Link from "next/link";
import { Pill } from "@/shared/ui/Pill";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { RISK_BANDS, riskCeilingFor, type OwnershipKey } from "@/shared/lib/ownership";
import type { PlannerResponse, SquadPlayer } from "@/shared/types/api";

/**
 * Where this squad differs from everyone else's, and where it doesn't.
 *
 * The feedback asked for a risk-appetite control surfacing low-ownership picks on
 * the main squad page rather than only in the players browser. The distinction
 * that matters here is that this read is about *your* squad: the players browser
 * answers "who could I pick?", this answers "how much of my team is the same team
 * everyone else has?". Unowned punts stay one link away rather than being
 * rebuilt here.
 *
 * Ownership is the live figure, not last season's final one - see the overlay in
 * fpl/domain/squad.py, without which a player everyone owned in May would still
 * read as chalk in August.
 */

/** Ownership high enough that owning the player is the consensus, not a decision. */
const CROWD_OWNERSHIP = 30;
const MAX_CROWD_ROWS = 5;

function xpFor(player: SquadPlayer, planner: PlannerResponse | null): number | null {
  if (player.live_id == null) return null;
  return planner?.players.find((p) => p.id === player.live_id)?.average_predicted_points ?? null;
}

function PlayerRow({
  player,
  planner,
  accent,
}: {
  player: SquadPlayer;
  planner: PlannerResponse | null;
  accent: string;
}) {
  const xp = xpFor(player, planner);
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      {player.team_badge && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.team_badge} alt="" className="h-5 w-5 shrink-0 object-contain" />
      )}
      <span className="min-w-0 flex-1">
        <PlayerLink id={player.live_id} className="text-sm font-semibold text-text-primary">
          {player.web_name}
        </PlayerLink>
        <span className="ml-1.5 font-mono text-xs text-text-muted">
          {player.team_short} · {player.pos}
        </span>
      </span>
      {xp != null && (
        <span className="shrink-0 font-mono text-xs text-text-secondary">{xp.toFixed(1)} xP/GW</span>
      )}
      <span className={`shrink-0 font-mono text-sm font-bold ${accent}`}>
        {player.selected_by_percent.toFixed(1)}%
      </span>
    </li>
  );
}

/** One-line readout for the rail. */
export function differentialsSummary(squad: SquadPlayer[], maxOwnership: number) {
  if (squad.length === 0) return null;
  return {
    edgeCount: squad.filter((p) => p.selected_by_percent <= maxOwnership).length,
    crowdCount: squad.filter((p) => p.selected_by_percent >= CROWD_OWNERSHIP).length,
  };
}

export function SquadDifferentials({
  squad,
  planner,
  riskKey,
  onRiskChange,
}: {
  squad: SquadPlayer[];
  planner: PlannerResponse | null;
  /** Lifted to the panel so the rail's summary and this read agree on the ceiling. */
  riskKey: OwnershipKey;
  onRiskChange: (key: OwnershipKey) => void;
}) {
  const max = riskCeilingFor(riskKey);
  const band = RISK_BANDS.find((b) => b.key === riskKey);

  const byOwnership = [...squad].sort((a, b) => a.selected_by_percent - b.selected_by_percent);
  const edge = byOwnership.filter((p) => p.selected_by_percent <= max);
  const crowd = [...squad]
    .filter((p) => p.selected_by_percent >= CROWD_OWNERSHIP)
    .sort((a, b) => b.selected_by_percent - a.selected_by_percent)
    .slice(0, MAX_CROWD_ROWS);

  return (
    <div>
      <p className="mb-3 text-xs text-text-muted">
        How much of this squad is a differential <InfoTooltip term="differentials" /> and how much is
        the same team your rivals have. Ownership <InfoTooltip term="ownership" /> is this season&apos;s
        live figure.
      </p>

      {/* Risk appetite as the control the feedback asked for: a ceiling, framed as
          boldness rather than as a filter, because that's the decision being made. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
          Risk appetite
        </span>
        {RISK_BANDS.map((b) => (
          <Pill key={b.key} active={b.key === riskKey} onClick={() => onRiskChange(b.key)}>
            {b.label}
          </Pill>
        ))}
        {band && <span className="text-xs text-text-secondary">{band.risk}</span>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-text-primary">
            Your edge · under {max}%
          </h4>
          {edge.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-xs text-text-secondary">
              Nothing under {max}% - this is a consensus squad at this risk setting. Loosen the ceiling,
              or browse{" "}
              <Link href="/players" className="font-semibold text-text-primary hover:underline">
                differentials
              </Link>{" "}
              for a punt.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {edge.map((p) => (
                <PlayerRow key={p.id} player={p} planner={planner} accent="text-text-primary" />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
            The crowd · {CROWD_OWNERSHIP}%+ owned
          </h4>
          {crowd.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-xs text-text-secondary">
              Nothing above {CROWD_OWNERSHIP}% - an unusually contrarian squad.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {crowd.map((p) => (
                  <PlayerRow key={p.id} player={p} planner={planner} accent="text-text-secondary" />
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-text-muted">
                Not a problem in itself - popular players are popular for a reason. It&apos;s where you
                gain nothing on your rivals if they score.
              </p>
            </>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Looking for differentials you don&apos;t own yet?{" "}
        <Link href="/players" className="font-semibold text-text-primary hover:underline">
          The players browser
        </Link>{" "}
        ranks the whole game by projected points under the same ownership ceilings.
      </p>
    </div>
  );
}
