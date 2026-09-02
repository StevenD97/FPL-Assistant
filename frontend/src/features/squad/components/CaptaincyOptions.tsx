import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { teamColorVar } from "@/shared/lib/teamColors";
import type { CaptaincyOption, SquadPlayer } from "@/shared/types/api";

const RANK_LABEL = ["Model's top pick", "2nd pick", "3rd pick", "4th pick", "5th pick"];

/** Captaincy candidates are always drawn from the same starting XI already
 * rendered above, so their richer fields (badge, kit, fixture) come from
 * there rather than duplicating them in the backend response. */
function findSquadRow(option: CaptaincyOption, squad: SquadPlayer[]): SquadPlayer | undefined {
  return squad.find((p) => p.web_name === option.web_name && p.team_short === option.team_short);
}

export function CaptaincyOptions({ options, squad }: { options: CaptaincyOption[]; squad: SquadPlayer[] }) {
  return (
    <div>
      <h3 className="mb-1 font-semibold text-text-primary">Captaincy options</h3>
      <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-text-muted">
        Your starting XI, ranked by Rating <InfoTooltip term="score" /> - a blend of form, fixture, underlying
        quality and set-piece duty, not just next gameweek&apos;s expected points on its own, so a lower expected-points
        figure can still rank above a higher one.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((option, i) => {
          const row = findSquadRow(option, squad);
          const isCurrentCaptain = option.captain_flag === "(C)";
          const isCurrentVice = option.captain_flag === "(VC)";
          return (
            <div
              key={`${option.web_name}-${option.team_short}`}
              className={`flex items-center gap-3 rounded-lg border-l-4 border-y border-r p-3 ${
                i === 0 ? "border-y-pl-green/40 border-r-pl-green/40 bg-pl-green/5" : "border-y-border border-r-border bg-white"
              }`}
              style={{ borderLeftColor: teamColorVar(option.team_short) }}
            >
              <PlayerPhoto
                src={row?.player_photo}
                name={option.web_name}
                className="h-11 w-11 shrink-0 rounded-full border border-border-strong bg-surface-sunken object-cover object-top text-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-text-primary">{option.web_name}</span>
                  <PositionBadge position={option.pos} />
                  {isCurrentCaptain && (
                    <span className="rounded-sm bg-pl-purple px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Your captain
                    </span>
                  )}
                  {isCurrentVice && (
                    <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-secondary">
                      Your vice
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                  <TeamBadge teamShort={option.team_short} name={option.team_short} badgeUrl={row?.team_badge} />
                  {row && <span>vs {row.next_opponent}</span>}
                </div>
                {/* Our own next-gameweek prediction, which is also what this
                    list is ranked by - not FPL's ep_next, which was shown here
                    while the order came from somewhere else entirely, and not
                    the 0-1 internal rating, which meant nothing to a reader
                    choosing a captain. */}
                <p className="mt-1 text-xs text-text-secondary">
                  {RANK_LABEL[i] ?? `${i + 1}th pick`} ·{" "}
                  <span className="font-mono font-medium text-text-primary">
                    {option.predicted_points_next.toFixed(1)}
                  </span>{" "}
                  pts expected next gameweek
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
