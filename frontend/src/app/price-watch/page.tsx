"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { PlayerLink } from "@/components/ui/PlayerLink";
import { PageContainer, PageHeader } from "@/components/layout/PageContainer";
import { TeamBadge } from "@/components/pitch/TeamBadge";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type PriceMover = {
  id: number;
  web_name: string;
  team_short: string;
  team_badge: string;
  cost: number;
  selected_by_percent: number;
  transfers_in_event: number;
  transfers_out_event: number;
  net_transfers_event: number;
  momentum_pct: number;
  direction: "rising" | "falling" | "stable";
  already_moved_today: boolean;
  official_progress_percent: string | null;
  transfer_rate_per_hour: number | null;
};

type PriceWatchResponse = {
  has_history_trend: boolean;
  history_snapshot_count: number;
  min_net_transfers_to_flag: number;
  risers: PriceMover[];
  fallers: PriceMover[];
};

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

export default function PriceWatchPage() {
  const [data, setData] = useState<PriceWatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/players/price-watch?limit=15`);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Price watch"
        subtitle={
          <>
            Players with the biggest net transfer activity today - a heuristic for who&apos;s at risk of a
            £0.1m price change at tonight&apos;s update (~2:30am UK), not a guaranteed prediction. FPL has never
            published its actual price-change algorithm; this ranks by net transfers in vs out today (FPL&apos;s
            own public data), the same raw signal community trackers like LiveFPL use.
          </>
        }
      />

      {loading && <p className="text-text-muted">Loading...</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {data && (
        <>
          {data.risers.length === 0 && data.fallers.length === 0 && (
            <Alert kind="info">
              No player has crossed {data.min_net_transfers_to_flag.toLocaleString()} net transfers today yet -
              normal before a season&apos;s deadlines start driving transfer activity. Check back closer to a
              gameweek deadline.
            </Alert>
          )}

          {!data.has_history_trend && (data.risers.length > 0 || data.fallers.length > 0) && (
            <Alert kind="info">
              Showing today&apos;s snapshot only - not enough ingest history yet to show a transfer rate (how
              fast activity is building). That fills in automatically as more data accumulates.
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-border px-3.5 py-3">
                <h2 className="text-md font-semibold text-text-primary">Likely risers</h2>
              </div>
              {data.risers.length === 0 ? (
                <p className="p-3.5 text-sm text-text-muted">No riser activity yet.</p>
              ) : (
                <ul>
                  {data.risers.map((m) => (
                    <MoverRow key={m.id} mover={m} sign="+" />
                  ))}
                </ul>
              )}
            </Card>

            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-border px-3.5 py-3">
                <h2 className="text-md font-semibold text-text-primary">Likely fallers</h2>
              </div>
              {data.fallers.length === 0 ? (
                <p className="p-3.5 text-sm text-text-muted">No faller activity yet.</p>
              ) : (
                <ul>
                  {data.fallers.map((m) => (
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
