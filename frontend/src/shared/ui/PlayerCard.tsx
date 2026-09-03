import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { StatMeter } from "@/shared/ui/StatMeter";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

const POS_COLOR: Record<string, string> = {
  GKP: "var(--pos-gkp)",
  DEF: "var(--pos-def)",
  MID: "var(--pos-mid)",
  FWD: "var(--pos-fwd)",
};

export type CardStat = {
  k: string;
  v: string;
  tooltip?: StatGlossaryKey;
  /**
   * 0-99, shown as a radial meter instead of a plain figure. Only set this where
   * a rating is *derived* - a percentile against the player pool, or a real
   * domain like minutes out of 90 (see lib/rating.ts). Stats where "high" isn't
   * "good" leave it off: a 99 for cost would say the player is expensive while
   * looking like praise.
   */
  rating?: number;
};

// FIFA-style player card. `rating` is the headline number (we use predicted
// xPts, on-brand for xFPL - not a fabricated 0-99).
//
// The per-stat dials are 0-99 because that's the idiom, but they're percentiles
// against the live player pool rather than invented figures, and each one keeps
// the raw value beside it - so the scale is a real measurement and the reader can
// always see what it was computed from. Front-only; hover shine.
export function PlayerCard({
  name,
  position,
  teamShort,
  teamBadge,
  photo,
  rating,
  ratingLabel = "xPTS",
  windowLabel,
  stats,
  size = "md",
  onClick,
}: {
  name: string;
  position: string;
  teamShort: string;
  teamBadge?: string;
  photo?: string;
  rating: string;
  ratingLabel?: string;
  windowLabel?: string;
  stats: CardStat[];
  /**
   * "hero" enlarges the card + photo for the player-detail hero. "compact" is for
   * putting three side by side to choose between - it drops to a single stat
   * column and a smaller photo, because at that width dials would truncate and
   * the decision is the headline number and the price anyway.
   */
  size?: "md" | "hero" | "compact";
  /** Makes the whole card the button, for comparison lists. */
  onClick?: () => void;
}) {
  const posColor = POS_COLOR[position] ?? "#ffffff";
  const hero = size === "hero";
  const compact = size === "compact";
  // 248px left the dial labels truncating ("SET PIECES" lost its end); at 300px a
  // cell is ~118px, which spells them out at 9px. See the max-w below.
  const ratedStats = stats.filter((s) => s.rating != null);
  const plainStats = stats.filter((s) => s.rating == null);
  const Root = onClick ? "button" : "div";
  return (
    <Root
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`group relative w-full shrink-0 overflow-hidden rounded-2xl border border-white/15 text-left text-white shadow-lg ${
        hero ? "max-w-[340px]" : compact ? "max-w-[168px]" : "max-w-[300px]"
      } ${onClick ? "transition-transform hover:-translate-y-0.5 hover:border-brand/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" : ""}`}
      style={{ background: "linear-gradient(158deg,var(--ink-700) 0%,var(--ink-800) 55%,var(--ink-900) 100%)" }}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-[110%] bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,0.22)_50%,transparent_68%)] transition-transform duration-700 group-hover:translate-x-[110%]" />

      <div className={`relative flex items-start justify-between pb-0 ${compact ? "p-2.5" : "p-4"}`}>
        <div className="flex flex-col items-center gap-1">
          <span
            className={`font-mono font-extrabold leading-none tracking-tight text-text-primary ${
              hero ? "text-[52px]" : compact ? "text-[26px]" : "text-[34px]"
            }`}
          >
            {rating}
          </span>
          <span className={`font-extrabold ${hero ? "text-sm" : "text-[10px]"}`} style={{ color: posColor }}>
            {position}
          </span>
          {teamBadge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={teamBadge}
              alt={teamShort}
              className={`mt-1.5 object-contain ${hero ? "h-12 w-12" : compact ? "h-7 w-7" : "h-10 w-10"}`}
            />
          ) : (
            <span className="mt-1.5 text-xs font-bold text-ink-300">{teamShort}</span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-300">
          {windowLabel ? `${ratingLabel} · ${windowLabel}` : ratingLabel}
          {ratingLabel === "xPTS" && (
            <InfoTooltip
              term="xPts"
              className="border-white/40 text-white/70 hover:border-white hover:bg-surface/20 hover:text-white"
            />
          )}
        </span>
      </div>

      <div className="relative -mt-2 flex justify-center">
        <PlayerPhoto
          src={photo}
          name={name}
          className={`rounded-full border-2 border-white/25 bg-ink-900/20 object-cover object-top ${
            hero ? "h-44 w-44 text-4xl" : compact ? "h-16 w-16 text-lg" : "h-28 w-28 text-2xl"
          }`}
        />
      </div>

      <div className={`relative ${compact ? "px-2.5 pb-3" : "px-4 pb-4"}`}>
        <div className={`truncate text-center font-extrabold tracking-wide ${compact ? "text-sm" : "text-lg"}`}>{name}</div>
        <div className="my-3 h-px bg-surface/15" />
        {/* Figures and dials are separated rather than interleaved. Sharing one
            grid put a one-line text row beside a 42px ring, so rows came out
            uneven and the last dial was orphaned in a row of its own. */}
        {plainStats.length > 0 && (
          <div className={`grid gap-x-3 gap-y-1 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
            {plainStats.map((s) => (
              <div key={s.k} className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-1 font-semibold text-ink-300">
                  {s.k}
                  {s.tooltip && (
                    <InfoTooltip
                      term={s.tooltip}
                      className="border-white/40 text-white/70 hover:border-white hover:bg-surface/20 hover:text-white"
                    />
                  )}
                </span>
                <span className="font-mono font-bold">{s.v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Compact skips the dials: at 168px a cell can't hold a 42px ring plus a
            spelled-out label, and when you're choosing between three players the
            headline number and the price are the decision. */}
        {ratedStats.length > 0 && !compact && (
          <div className={`grid grid-cols-2 gap-x-3 gap-y-2.5 ${plainStats.length > 0 ? "mt-3" : ""}`}>
            {ratedStats.map((s) => (
              <StatMeter
                key={s.k}
                label={s.k}
                rating={s.rating as number}
                value={s.v}
                tooltip={s.tooltip}
                size={hero ? 48 : 42}
              />
            ))}
          </div>
        )}
      </div>
    </Root>
  );
}
