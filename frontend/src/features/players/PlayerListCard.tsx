import Link from "next/link";
import { PositionBadge } from "@/shared/ui/PositionBadge";
import { StatusBadge } from "@/shared/ui/StatusBadge";
import { PlayerPhoto } from "@/shared/ui/PlayerPhoto";
import { FdrChip } from "@/shared/ui/FdrChip";
import { ShortlistStar } from "@/shared/ui/ShortlistStar";
import { Skeleton } from "@/shared/ui/Skeleton";
import type { PlayerListItem } from "@/shared/types/api";

const POS_ACCENT: Record<string, string> = {
  GKP: "bg-pos-gkp",
  DEF: "bg-pos-def",
  MID: "bg-pos-mid",
  FWD: "bg-pos-fwd",
};

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-sm font-bold text-text-primary">{v}</span>
      <span className="text-[11px] uppercase tracking-wide text-text-muted">{k}</span>
    </div>
  );
}

/**
 * One player in the list.
 *
 * Two presentations from one element, chosen by width rather than by
 * rendering both and hiding one:
 *
 *   Phone   - a 64px row: who, what they cost, what they're projected to
 *             score. Three facts, one line of meta, nothing else.
 *   Tablet+ - the full tile: badge row, photo, headline xPts, price/value/
 *             ownership, a four-stat season strip and the fixture ticker.
 *
 * The tile was the only presentation, at every width. On a 390px phone that
 * made the page 7,029 pixels tall for 24 players - eight screens of scrolling
 * to compare a list - with 182 separate runs of sub-11px text. Nine tenths of
 * that detail is research a person does sitting down; the phone view is for
 * finding a name and a number. The extra blocks are `hidden sm:…`, so the
 * phone doesn't pay for markup it never shows.
 */
export function PlayerListCard({ p, inDraft = false }: { p: PlayerListItem; inDraft?: boolean }) {
  const s = p.season_stats;
  const xgi = s ? Number(s.expected_goal_involvements).toFixed(1) : "—";
  return (
    <Link
      href={`/players/${p.id}`}
      className="group card-lift relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-sm hover:border-brand/40 sm:block sm:p-3.5"
    >
      <span className={`absolute inset-x-0 top-0 h-1 ${POS_ACCENT[p.position] ?? "bg-ink-300"}`} />

      {/* Tile-only: club, position and availability get their own row. On a
          phone they ride in the meta line under the name instead. */}
      <div className="hidden items-center justify-between gap-2 sm:flex">
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
          {inDraft && (
            <span className="rounded-sm bg-ink-900/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-primary">
              In draft
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge status={p.status} news={p.news} />
          <ShortlistStar id={p.id} className="flex h-11 w-11 items-center justify-center text-base" />
        </div>
      </div>

      <PlayerPhoto
        src={p.player_photo}
        name={p.web_name}
        className="h-11 w-11 shrink-0 rounded-full border border-border bg-surface-sunken object-cover object-top text-xs sm:mt-2"
      />

      <div className="min-w-0 flex-1 sm:mt-2 sm:flex sm:items-center sm:gap-2.5">
        <span className="block truncate text-md font-semibold text-text-primary group-hover:underline">
          {p.web_name}
        </span>
        {/* Phone-only meta line: club, position, price, and availability if
            it isn't "available". The three facts a phone reader needs beside
            the projection. */}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted sm:hidden">
          <span className="font-mono">{p.team_short}</span>
          <PositionBadge position={p.position} />
          <span className="font-mono">£{p.cost.toFixed(1)}m</span>
          <StatusBadge status={p.status} news={p.news} />
        </span>
      </div>

      {/* The projection. On a phone this is the right-hand column of the row;
          on a tile it sits above the price block. */}
      <div className="shrink-0 text-right leading-none sm:mt-2 sm:flex sm:items-end sm:justify-between sm:gap-2 sm:text-left">
        <div className="leading-none">
          <span className="font-mono text-xl font-bold text-text-primary sm:text-2xl">
            {p.predicted_points.toFixed(1)}
          </span>
          <span className="ml-1 hidden text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:inline">
            xPts · 5GW
          </span>
          <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted sm:hidden">
            xPts
          </span>
        </div>
        <div className="hidden text-right leading-tight sm:block">
          <div className="font-mono text-sm font-semibold text-text-primary">£{p.cost.toFixed(1)}m</div>
          <div className="font-mono text-[11px] text-text-muted">
            {p.value.toFixed(1)}/£m · {p.selected_by_percent.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className="mt-3 hidden grid-cols-4 gap-1 border-t border-border pt-2.5 sm:grid">
        <Stat k="PTS" v={s?.total_points ?? "—"} />
        <Stat k="GLS" v={s?.goals_scored ?? "—"} />
        <Stat k="AST" v={s?.assists ?? "—"} />
        <Stat k="xGI" v={xgi} />
      </div>

      {p.fixtures.length > 0 && (
        <div className="mt-2.5 hidden flex-wrap items-center gap-1 border-t border-border pt-2.5 sm:flex">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Next</span>
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

// Loading placeholder matching PlayerListCard's shape at both widths - the
// phone row and the full tile - so the list doesn't reflow when real content
// swaps in.
export function PlayerListCardSkeleton() {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-sm sm:block sm:p-3.5">
      <span className="absolute inset-x-0 top-0 h-1 bg-ink-200" />
      <div className="hidden items-center justify-between gap-2 sm:flex">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-4 w-9 rounded" />
        </div>
      </div>
      <Skeleton className="h-11 w-11 shrink-0 rounded-full sm:mt-2" />
      <div className="min-w-0 flex-1 sm:mt-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-1.5 h-3 w-32 sm:hidden" />
      </div>
      <Skeleton className="h-7 w-14 shrink-0 sm:mt-2 sm:w-16" />
      <div className="mt-3 hidden grid-cols-4 gap-2 border-t border-border pt-2.5 sm:grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="mt-2.5 hidden flex-wrap gap-1 border-t border-border pt-2.5 sm:flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-12 rounded-sm" />
        ))}
      </div>
    </div>
  );
}
