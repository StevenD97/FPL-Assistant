import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

const POS_COLOR: Record<string, string> = {
  GKP: "#ffdd3c",
  DEF: "#04f5ff",
  MID: "#00ff87",
  FWD: "#e90052",
};

// FIFA-style player card. `rating` is the headline number (we use predicted
// xPts, on-brand for xFPL - not a fabricated 0-99). Front-only; hover shine.
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
}: {
  name: string;
  position: string;
  teamShort: string;
  teamBadge?: string;
  photo?: string;
  rating: string;
  ratingLabel?: string;
  windowLabel?: string;
  stats: { k: string; v: string; tooltip?: StatGlossaryKey }[];
  /** "hero" enlarges the card + photo for the player-detail hero. */
  size?: "md" | "hero";
}) {
  const posColor = POS_COLOR[position] ?? "#ffffff";
  const hero = size === "hero";
  return (
    <div
      className={`group relative w-full shrink-0 overflow-hidden rounded-2xl border border-white/15 text-white shadow-lg ${
        hero ? "max-w-[320px]" : "max-w-[248px]"
      }`}
      style={{ background: "linear-gradient(158deg,#5a1a63 0%,#37003c 42%,#0f7a3d 155%)" }}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-[110%] bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,0.22)_50%,transparent_68%)] transition-transform duration-700 group-hover:translate-x-[110%]" />

      <div className="relative flex items-start justify-between p-4 pb-0">
        <div className="flex flex-col items-center gap-1">
          <span
            className={`font-mono font-extrabold leading-none tracking-tight text-pl-green ${
              hero ? "text-[52px]" : "text-[34px]"
            }`}
          >
            {rating}
          </span>
          <span className={`font-extrabold ${hero ? "text-sm" : "text-[11px]"}`} style={{ color: posColor }}>
            {position}
          </span>
          {teamBadge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teamBadge} alt={teamShort} className={`mt-1 object-contain ${hero ? "h-8 w-8" : "h-6 w-6"}`} />
          ) : (
            <span className="mt-1 text-[10px] font-bold text-[#c9a9d1]">{teamShort}</span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#c9a9d1]">
          {windowLabel ? `${ratingLabel} · ${windowLabel}` : ratingLabel}
          {ratingLabel === "xPTS" && (
            <InfoTooltip
              term="xPts"
              className="border-white/40 text-white/70 hover:border-white hover:bg-white/20 hover:text-white"
            />
          )}
        </span>
      </div>

      <div className="relative -mt-2 flex justify-center">
        <PlayerPhoto
          src={photo}
          name={name}
          className={`rounded-full border-2 border-white/25 bg-black/20 object-cover object-top ${
            hero ? "h-44 w-44 text-4xl" : "h-28 w-28 text-2xl"
          }`}
        />
      </div>

      <div className="relative px-4 pb-4">
        <div className="truncate text-center text-lg font-extrabold tracking-wide">{name}</div>
        <div className="my-3 h-px bg-white/15" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {stats.map((s) => (
            <div key={s.k} className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-1 font-semibold text-[#c9a9d1]">
                {s.k}
                {s.tooltip && (
                  <InfoTooltip
                    term={s.tooltip}
                    className="border-white/40 text-white/70 hover:border-white hover:bg-white/20 hover:text-white"
                  />
                )}
              </span>
              <span className="font-mono font-bold">{s.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
