import Link from "next/link";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { StatusBadge } from "@/shared/ui/StatusBadge";

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

      <div className="mt-2 truncate text-md font-semibold text-pl-purple group-hover:underline">{p.web_name}</div>

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
    </Link>
  );
}
