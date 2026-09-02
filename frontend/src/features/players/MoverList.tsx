"use client";

import { useState } from "react";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import type { PriceMover } from "@/shared/types/api";

const VISIBLE_CAP = 8;

function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function MoverRow({ mover, sign }: { mover: PriceMover; sign: "+" | "-" }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamBadge teamShort={mover.team_short} name="" badgeUrl={mover.team_badge} />
        <div className="flex min-w-0 flex-col">
          <PlayerLink id={mover.id} className="truncate text-sm font-medium text-text-primary">
            {mover.web_name}
          </PlayerLink>
          <span className="text-xs text-text-muted">
            {mover.team_short} &middot; £{mover.cost.toFixed(1)}m &middot;{" "}
            {mover.selected_by_percent.toFixed(1)}% owned
          </span>
        </div>
      </div>
      {/* Progress toward the change first, transfer count second. A raw net
          transfer count is an input to a decision nobody can make from it;
          "94% of the way to a rise" is the decision. It is FPL's own figure
          (price_change_percent), updated every fifteen minutes, not a guess
          at their threshold. */}
      <div className="flex shrink-0 flex-col items-end">
        {mover.change_progress_pct != null ? (
          <span
            className={`font-mono text-sm font-semibold ${sign === "+" ? "text-success" : "text-danger"}`}
          >
            {mover.change_progress_pct.toFixed(0)}%
          </span>
        ) : (
          <span
            className={`font-mono text-sm font-semibold ${sign === "+" ? "text-success" : "text-danger"}`}
          >
            {sign}
            {formatCount(Math.abs(mover.net_transfers_event))}
          </span>
        )}
        {mover.about_to_change ? (
          <span
            className={`text-[11px] font-bold uppercase tracking-wide ${
              sign === "+" ? "text-success" : "text-danger"
            }`}
          >
            Changes tonight
          </span>
        ) : mover.already_moved_today ? (
          <span className="text-[11px] font-medium text-text-muted">already moved today</span>
        ) : (
          <span className="font-mono text-[11px] text-text-muted">
            {sign}
            {formatCount(Math.abs(mover.net_transfers_event))} transfers
          </span>
        )}
        {mover.transfer_rate_per_hour != null && (
          <span className="font-mono text-[11px] text-text-muted">
            {mover.transfer_rate_per_hour > 0 ? "+" : ""}
            {formatCount(mover.transfer_rate_per_hour)}/hr
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * One column of price movers, ordered by how close each is to actually
 * moving. The endpoint returns 15 per direction, which stacked to 30
 * consecutive rows on a phone; only the leading few are shown until asked,
 * since the ones that matter are at the top.
 */
export function MoverList({
  movers,
  sign,
  emptyLabel,
}: {
  movers: PriceMover[];
  sign: "+" | "-";
  emptyLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (movers.length === 0) return <p className="p-3.5 text-sm text-text-muted">{emptyLabel}</p>;

  const visible = showAll ? movers : movers.slice(0, VISIBLE_CAP);
  return (
    <>
      <ul>
        {visible.map((m) => (
          <MoverRow key={m.id} mover={m} sign={sign} />
        ))}
      </ul>
      {movers.length > VISIBLE_CAP && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full border-t border-border px-3.5 py-2.5 text-xs font-semibold text-pl-purple hover:bg-surface-sunken"
        >
          {showAll ? "Show fewer" : `Show all ${movers.length}`}
        </button>
      )}
    </>
  );
}
