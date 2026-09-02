import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { TransferPlayer } from "@/shared/types/api";

/**
 * One side of an out/in pair - a photo'd, badged row rather than a name in
 * parentheses, and a colour block (danger for the player leaving, success
 * for the one arriving) so a glance at the pair reads as a swap, not a list.
 * Shared by Suggested transfers and the blank-gameweek advisor - both are
 * "here's a transfer" reads built on the same optimizer response shape.
 */
export function TransferPlayerRow({ p, tone }: { p: TransferPlayer; tone: "out" | "in" }) {
  return (
    <li
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
        tone === "out" ? "border-danger/20 bg-danger-bg" : "border-success/20 bg-success-bg"
      }`}
    >
      <PlayerPhoto
        src={p.player_photo}
        name={p.web_name}
        className="h-8 w-8 shrink-0 rounded-full border border-border-strong bg-white object-cover object-top text-3xs"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1">
          <span className="truncate text-sm font-medium text-text-primary">{p.web_name}</span>
          <PositionBadge position={p.position} />
        </span>
        <TeamBadge teamShort={p.team_short} name={p.team_short} badgeUrl={p.team_badge} />
      </span>
    </li>
  );
}
