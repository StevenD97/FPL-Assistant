import Link from "next/link";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { FdrChip } from "@/shared/ui/FdrChip";
import { Skeleton } from "@/shared/ui/Skeleton";

const POS_ACCENT: Record<string, string> = {
  GKP: "bg-pos-gkp",
  DEF: "bg-pos-def",
  MID: "bg-pos-mid",
  FWD: "bg-pos-fwd",
};

export type PlayerListItem = {
  id: number;
  web_name: string;
  team_short: string;
  team_badge: string;
  player_photo: string;
  position: string;
  cost: number;
  predicted_points: number;
  value: number;
  selected_by_percent: number;
  status: string;
  news: string;
  season_stats: {
    total_points: number;
    goals_scored: number;
    assists: number;
    expected_goal_involvements: string | number;
  } | null;
  fixtures: { opponent: string; is_home: boolean; difficulty: number; opponent_badge: string }[];
};

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-sm font-bold text-text-primary">{v}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{k}</span>
    </div>
  );
}

// Rich player tile for the Players grid: club badge, position, status, the
// headline xPts, price/value/ownership, and a season stat strip - scannable
// at a glance instead of a wall of names.
export function PlayerListCard({ p }: { p: PlayerListItem }) {
  const s = p.season_stats;
  const xgi = s ? Number(s.expected_goal_involvements).toFixed(1) : "—";
  return (
    <Link
      href={`/players/${p.id}`}
      className="group card-lift relative block overflow-hidden rounded-lg border border-border bg-white p-3.5 shadow-sm hover:border-pl-purple/40"
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${POS_ACCENT[p.position] ?? "bg-slate-300"}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.team_badge}
            alt=""
            className="h-6 w-6 shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
          <span className="font-mono text-[11px] text-text-muted">{p.team_short}</span>
          <PositionBadge position={p.position} />
        </div>
        <StatusBadge status={p.status} news={p.news} />
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <PlayerPhoto
          src={p.player_photo}
          name={p.web_name}
          className="h-11 w-11 shrink-0 rounded-full border border-border bg-surface-sunken object-cover object-top text-xs"
        />
        <span className="min-w-0 truncate text-md font-semibold text-pl-purple group-hover:underline">
          {p.web_name}
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="leading-none">
          <span className="font-mono text-2xl font-bold text-pl-purple">{p.predicted_points.toFixed(1)}</span>
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">xPts · 5GW</span>
        </div>
        <div className="text-right leading-tight">
          <div className="font-mono text-sm font-semibold text-text-primary">£{p.cost.toFixed(1)}m</div>
          <div className="font-mono text-[10px] text-text-muted">
            {p.value.toFixed(1)}/£m · {p.selected_by_percent.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-border pt-2.5">
        <Stat k="PTS" v={s?.total_points ?? "—"} />
        <Stat k="GLS" v={s?.goals_scored ?? "—"} />
        <Stat k="AST" v={s?.assists ?? "—"} />
        <Stat k="xGI" v={xgi} />
      </div>

      {p.fixtures.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1 border-t border-border pt-2.5">
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">Next</span>
          {p.fixtures.slice(0, 5).map((fx, i) => (
            <FdrChip
              key={i}
              opponent={fx.opponent}
              isHome={fx.is_home}
              difficulty={fx.difficulty}
              badgeUrl={fx.opponent_badge}
            />
          ))}
        </div>
      )}
    </Link>
  );
}

// Loading placeholder matching PlayerListCard's shape - the same accent bar,
// badge row, photo + name, headline number, and 4-stat strip, so the grid
// doesn't reflow when real cards swap in.
export function PlayerListCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white p-3.5 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-1 bg-slate-200" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-4 w-9 rounded" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-7 w-14" />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-border pt-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-12 rounded-sm" />
        ))}
      </div>
    </div>
  );
}
