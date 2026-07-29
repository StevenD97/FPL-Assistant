"use client";

import Link from "next/link";
import { FdrChip } from "@/shared/ui/FdrChip";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { useSquadDraftCount } from "@/shared/lib/draft";
import type { PreSeasonCockpitData } from "./hooks/useCockpit";
import { CockpitShell, CockpitStat } from "./components/CockpitShell";

const SQUAD_SIZE = 15;

/**
 * What the landing page shows a connected manager before their first gameweek
 * locks. FPL exposes no picks, rank, team value or bank until then - see
 * useCockpit - so nothing personal is available beyond their name and any draft
 * they've started on this device.
 *
 * Rather than a large empty panel for the weeks before GW1, the hero leans on
 * the data that *is* live: who the model likes, which clubs open kindest, and
 * where the market is moving. Same shell as the live cockpit, so the page fills
 * in at GW1 instead of changing shape.
 */
export function PreSeasonCockpit({
  data,
  teamName,
}: {
  data: PreSeasonCockpitData;
  teamName: string | null;
}) {
  const drafted = useSquadDraftCount();

  return (
    <CockpitShell
      eyebrow="Pre-season · 2026/27"
      title={teamName ? `Ready when you are, ${teamName}` : "Ready when you are"}
      subtitle="Your points, rank and squad analysis appear here the moment GW1 locks. Until then, here's where the season is shaping up."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CockpitStat
          label="Your draft"
          value={`${drafted}/${SQUAD_SIZE}`}
          hint={drafted === SQUAD_SIZE ? "Squad complete" : "Players picked"}
        />
        <CockpitStat
          label="Top xPts"
          value={data.topPicks[0] ? data.topPicks[0].predicted_points.toFixed(1) : "—"}
          hint={data.topPicks[0]?.web_name ?? "Loading"}
          tooltip="xPts"
        />
        <CockpitStat
          label="Kindest start"
          value={data.kindestOpeners[0]?.team ?? "—"}
          hint={
            data.kindestOpeners[0]?.avg_difficulty != null
              ? `Avg FDR ${data.kindestOpeners[0].avg_difficulty}`
              : "Next 5 GWs"
          }
          tooltip="avgFdr"
        />
        <CockpitStat label="Gameweek" value="1" hint="Season opener" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Model's top picks" href="/players" cta="All players">
          <ul className="flex flex-col">
            {data.topPicks.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2.5 border-t border-white/10 py-1.5 first:border-t-0 first:pt-0"
              >
                <PlayerPhoto
                  src={p.player_photo}
                  name={p.web_name}
                  className="h-7 w-7 shrink-0 rounded-full border border-white/20 bg-white/10 object-cover object-top text-[8px]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {p.web_name}
                </span>
                <span className="shrink-0 text-[11px] text-[#c9a9d1]">
                  {p.team_short} · £{p.cost.toFixed(1)}m
                </span>
                <span className="shrink-0 font-mono text-sm font-bold text-pl-green">
                  {p.predicted_points.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Kindest opening runs" href="/matches" cta="All fixtures">
          <ul className="flex flex-col">
            {data.kindestOpeners.map((row) => (
              <li
                key={row.team_id}
                className="flex items-center gap-2.5 border-t border-white/10 py-1.5 first:border-t-0 first:pt-0"
              >
                <TeamBadge teamShort={row.team} name={row.team} badgeUrl={row.team_badge} />
                <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
                  {row.fixtures.slice(0, 5).map((f, i) => (
                    <FdrChip
                      key={i}
                      opponent={f.opponent}
                      isHome={f.is_home}
                      difficulty={f.difficulty}
                      badgeUrl={f.opponent_badge}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Link
        href="/squad"
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-pl-green px-4 py-2.5 text-sm font-bold text-pl-purple transition-transform hover:scale-[1.02]"
      >
        {drafted > 0 ? "Continue your draft" : "Build your GW1 squad"} →
      </Link>
    </CockpitShell>
  );
}

function Panel({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.07] p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#c9a9d1]">{title}</p>
        <Link href={href} className="text-[11px] font-semibold text-pl-green hover:underline">
          {cta} →
        </Link>
      </div>
      {children}
    </div>
  );
}
