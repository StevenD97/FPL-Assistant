"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { Skeleton } from "@/shared/ui/Skeleton";
import { apiGet } from "@/shared/lib/api";
import type { PriceMover, PriceWatchResponse } from "@/shared/types/api";

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
            {mover.team_short} &middot; £{mover.cost.toFixed(1)}m &middot; {mover.selected_by_percent.toFixed(1)}% owned
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span
          className={`font-mono text-sm font-semibold ${
            sign === "+" ? "text-success" : "text-danger"
          }`}
        >
          {sign}
          {formatCount(Math.abs(mover.net_transfers_event))}
        </span>
        {mover.transfer_rate_per_hour != null && (
          <span className="font-mono text-[11px] text-text-muted">
            {mover.transfer_rate_per_hour > 0 ? "+" : ""}
            {formatCount(mover.transfer_rate_per_hour)}/hr
          </span>
        )}
        {mover.already_moved_today && (
          <span className="text-[11px] font-medium text-text-muted">already moved today</span>
        )}
      </div>
    </li>
  );
}

// Two columns (risers / fallers) of mover rows - mirrors the loaded layout.
function PriceWatchSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {["Likely risers", "Likely fallers"].map((title) => (
        <Card key={title} padded={false} className="overflow-hidden">
          <div className="border-b border-border px-3.5 py-3">
            <h2 className="text-md font-semibold text-text-primary">{title}</h2>
          </div>
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-10" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function PriceWatchPage() {
  const [data, setData] = useState<PriceWatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setData(await apiGet<PriceWatchResponse>("/api/players/price-watch?limit=15"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // /api/players/price-watch answers in two shapes: risers+fallers for a plain
  // request, or `owned` when given player_ids (what the Home dashboard asks
  // for). This page only ever makes the first call, so both keys are always
  // present here - narrow once rather than guarding at every use.
  const risers = data?.risers ?? [];
  const fallers = data?.fallers ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Price watch"
        subtitle="Players with the biggest net transfer activity today - a signal for who's at risk of a £0.1m
          price change at tonight's update (~2:30am UK), not a guaranteed prediction."
      />

      {loading && <PriceWatchSkeleton />}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {data && (
        <>
          {risers.length === 0 && fallers.length === 0 && (
            <Alert kind="info">
              No player has crossed {data.min_net_transfers_to_flag.toLocaleString()} net transfers yet today.
              Check back closer to a gameweek deadline.
            </Alert>
          )}

          {!data.has_history_trend && (risers.length > 0 || fallers.length > 0) && (
            <Alert kind="info">
              Showing today&apos;s snapshot only - transfer rate will appear once more data has been collected.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-border px-3.5 py-3">
                <h2 className="text-md font-semibold text-text-primary">Likely risers</h2>
              </div>
              {risers.length === 0 ? (
                <p className="p-3.5 text-sm text-text-muted">No riser activity yet.</p>
              ) : (
                <ul>
                  {risers.map((m) => (
                    <MoverRow key={m.id} mover={m} sign="+" />
                  ))}
                </ul>
              )}
            </Card>

            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-border px-3.5 py-3">
                <h2 className="text-md font-semibold text-text-primary">Likely fallers</h2>
              </div>
              {fallers.length === 0 ? (
                <p className="p-3.5 text-sm text-text-muted">No faller activity yet.</p>
              ) : (
                <ul>
                  {fallers.map((m) => (
                    <MoverRow key={m.id} mover={m} sign="-" />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </PageContainer>
  );
}
