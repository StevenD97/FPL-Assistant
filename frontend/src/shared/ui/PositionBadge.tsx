import type { Position } from "@/shared/types/api";

const POSITION_BG: Record<Position, string> = {
  GKP: "bg-pos-gkp",
  DEF: "bg-pos-def",
  MID: "bg-pos-mid",
  FWD: "bg-pos-fwd",
};

export function PositionBadge({ position }: { position: string }) {
  const bg = POSITION_BG[position as Position] ?? "bg-ink-300";
  return (
    <span
      className={`inline-flex h-5 w-[34px] items-center justify-center rounded-sm font-mono text-[11px] font-semibold tracking-wide text-text-primary ${bg}`}
    >
      {position}
    </span>
  );
}
