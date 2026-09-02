"use client";

import Link from "next/link";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PitchFormation, type PitchPlayer } from "@/shared/pitch/PitchFormation";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { Panel } from "@/shared/ui/Panel";
import { nextChip } from "@/shared/lib/chips";
import { formatRank } from "@/shared/lib/team";
import type { SquadPlayer, TeamEntry } from "@/shared/types/api";
import type { LiveCockpitData } from "./hooks/useCockpit";
import { CockpitShell, CockpitStat } from "./components/CockpitShell";

/**
 * Expected bench points that make a Bench Boost worth playing.
 *
 * A rough line, deliberately: an average gameweek returns ~4 points a player,
 * so a bench predicted to beat sixteen is one that would earn more than a
 * replacement-level four-man bench. It exists so the tile says something a
 * manager can act on rather than restating the number in words.
 */
const BENCH_BOOST_WORTH_IT = 16;

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

/**
 * The landing page for a connected manager once their first gameweek has
 * locked: the same shell as the pre-season cockpit, filled with their own
 * numbers, XI, captaincy call, chip timing, transfer suggestion, mini-league
 * standings and price alerts.
 */
export function LiveCockpit({
  data,
  entry,
}: {
  data: LiveCockpitData;
  entry: TeamEntry | null;
}) {
  const { squad, transfers, leagues, movers } = data;
  const bench = squad.squad.filter((p) => p.role !== "Starting XI");
  const captain = squad.squad.find((p) => p.captain_flag === "(C)");
  const bestCaptain = squad.captaincy_options?.[0];
  const chip = nextChip(data.chips);
  const topTransfer =
    transfers && transfers.transferred_in.length > 0
      ? { out: transfers.transferred_out[0], in: transfers.transferred_in[0] }
      : null;

  return (
    <CockpitShell
      eyebrow={`Gameweek ${squad.event} · your dashboard`}
      title={squad.entry_name}
    >
      {/* Four info triggers in a four-tile grid is not four explanations, it
          is visual noise - and the one that most needed explaining, "bench
          strength 0.133", was an internal normalised score that no amount of
          tooltip could make actionable. Every tile now carries a unit a
          manager already thinks in, and says what it means in its own hint. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CockpitStat
          label={`GW${squad.event} points`}
          value={squad.points}
          hint={
            entry?.overall_rank != null ? `Rank ${formatRank(entry.overall_rank)}` : undefined
          }
        />
        <CockpitStat
          label="Squad value"
          value={`£${squad.squad_value.toFixed(1)}m`}
          hint={`£${squad.bank.toFixed(1)}m in the bank`}
        />
        <CockpitStat
          label="Captain"
          value={captain?.web_name ?? "—"}
          hint={
            bestCaptain && bestCaptain.web_name !== captain?.web_name
              ? `Model prefers ${bestCaptain.web_name}`
              : "Matches the model"
          }
        />
        <CockpitStat
          label="Bench next GW"
          value={`${squad.bench_predicted_points.toFixed(1)} pts`}
          hint={
            squad.bench_predicted_points >= BENCH_BOOST_WORTH_IT
              ? "Worth a Bench Boost"
              : "Too thin to boost"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
        {/* The XI, straight on the landing page - the thing a manager actually
            wants to look at. */}
        <div className="rounded-lg border border-white/15 bg-white/[0.07] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#c9a9d1]">
              Your starting XI
            </p>
            <Link href="/squad" className="tap-target inline-flex items-center text-[11px] font-semibold text-pl-green hover:underline">
              Open workspace →
            </Link>
          </div>
          <PitchFormation
            inset
            players={squad.squad.filter((p) => p.role === "Starting XI").map(toPitchPlayer)}
          />
        </div>

        <div className="flex flex-col gap-3">
          {topTransfer && (
            <Panel tone="hero" title="Suggested transfer" href="/squad" cta="See all">
              <div className="flex items-center gap-2 text-sm">
                {/* pl-pink, not the --danger token: that one is tuned for text
                    on white and drops to unreadable on the purple hero. */}
                <span className="min-w-0 flex-1 truncate text-pl-pink">
                  ↓ {topTransfer.out?.web_name}
                </span>
                <span className="min-w-0 flex-1 truncate text-right font-semibold text-pl-green">
                  ↑ {topTransfer.in?.web_name}
                </span>
              </div>
              {transfers && (
                <p className="mt-1 text-[11px] text-[#c9a9d1]">
                  {transfers.transfers_made} transfer
                  {transfers.transfers_made === 1 ? "" : "s"}
                  {transfers.points_hit > 0 ? ` · -${transfers.points_hit} hit` : " · no hit"}
                </p>
              )}
            </Panel>
          )}

          {chip && (
            <Panel tone="hero" title="Chip timing" href="/squad" cta="Full scan">
              <p className="text-sm font-semibold text-white">
                {chip.name} <span className="text-pl-green">· GW{chip.event}</span>
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[#c9a9d1]">{chip.detail}</p>
            </Panel>
          )}

          {leagues.length > 0 && (
            <Panel tone="hero" title="Mini-leagues" href="/leagues" cta="Standings">
              <ul className="flex flex-col">
                {leagues.slice(0, 3).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-3 border-t border-white/10 py-1 text-sm first:border-t-0 first:pt-0"
                  >
                    <span className="min-w-0 truncate text-white">{l.name}</span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-pl-green">
                      {l.entry_rank > 0 ? formatRank(l.entry_rank) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {bench.length > 0 && (
            <Panel tone="hero" title="Bench" href="/squad" cta="Reorder">
              <ul className="flex flex-col">
                {bench.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2.5 border-t border-white/10 py-1 text-sm first:border-t-0 first:pt-0"
                  >
                    <PlayerPhoto
                      src={p.player_photo}
                      name={p.web_name}
                      className="h-6 w-6 shrink-0 rounded-full border border-white/20 bg-white/10 object-cover object-top text-[8px]"
                    />
                    <span className="min-w-0 flex-1 truncate text-white">{p.web_name}</span>
                    <span className="shrink-0 text-[11px] text-[#c9a9d1]">
                      {p.pos} · {p.team_short}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {movers.length > 0 && (
            <Panel tone="hero" title="Price watch · your players" href="/price-watch" cta="All movers">
              <ul className="flex flex-col">
                {movers.slice(0, 3).map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 border-t border-white/10 py-1 text-sm first:border-t-0 first:pt-0"
                  >
                    <TeamBadge teamShort={m.team_short} name={m.web_name} badgeUrl={m.team_badge} />
                    <span
                      className={`shrink-0 font-mono text-xs font-semibold ${
                        m.direction === "rising" ? "text-pl-green" : "text-pl-pink"
                      }`}
                    >
                      {m.direction === "rising" ? "+" : "-"}
                      {Math.abs(m.net_transfers_event).toLocaleString("en-GB")}
                      {m.already_moved_today ? " (moved)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </CockpitShell>
  );
}
