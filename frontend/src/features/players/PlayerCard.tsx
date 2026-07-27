import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";

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
}: {
  name: string;
  position: string;
  teamShort: string;
  teamBadge?: string;
  photo?: string;
  rating: string;
  ratingLabel?: string;
  windowLabel?: string;
  stats: { k: string; v: string }[];
}) {
  const posColor = POS_COLOR[position] ?? "#ffffff";
  return (
    <div
      className="group relative w-full max-w-[248px] shrink-0 overflow-hidden rounded-2xl border border-white/15 text-white shadow-lg"
      style={{ background: "linear-gradient(158deg,#5a1a63 0%,#37003c 42%,#0f7a3d 155%)" }}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-[110%] bg-[linear-gradient(115deg,transparent_32%,rgba(255,255,255,0.22)_50%,transparent_68%)] transition-transform duration-700 group-hover:translate-x-[110%]" />

      <div className="relative flex items-start justify-between p-4 pb-0">
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-[34px] font-extrabold leading-none tracking-tight text-pl-green">
            {rating}
          </span>
          <span className="text-[11px] font-extrabold" style={{ color: posColor }}>
            {position}
          </span>
          {teamBadge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={teamBadge} alt={teamShort} className="mt-1 h-6 w-6 object-contain" />
          ) : (
            <span className="mt-1 text-[10px] font-bold text-[#c9a9d1]">{teamShort}</span>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#c9a9d1]">
          {windowLabel ? `${ratingLabel} · ${windowLabel}` : ratingLabel}
        </span>
      </div>

      <div className="relative -mt-2 flex justify-center">
        <PlayerPhoto
          src={photo}
          name={name}
          className="h-28 w-28 rounded-full border-2 border-white/25 bg-black/20 object-cover object-top text-2xl"
        />
      </div>

      <div className="relative px-4 pb-4">
        <div className="truncate text-center text-lg font-extrabold tracking-wide">{name}</div>
        <div className="my-3 h-px bg-white/15" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {stats.map((s) => (
            <div key={s.k} className="flex items-center justify-between text-[13px]">
              <span className="font-semibold text-[#c9a9d1]">{s.k}</span>
              <span className="font-mono font-bold">{s.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
