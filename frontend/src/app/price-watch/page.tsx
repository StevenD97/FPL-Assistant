import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { PlayerLink } from "@/shared/ui/PlayerLink";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { TeamBadge } from "@/shared/pitch/TeamBadge";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
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


// Prices move through the day, so this is per-request; force-dynamic also
// keeps `next build` from calling the backend.
export const dynamic = "force-dynamic";

export default async function PriceWatchPage() {
  let data: PriceWatchResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiGet<PriceWatchResponse>("/api/players/price-watch?limit=15");
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong";
  }

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

          {/* One legend covers every row's figures, since net transfers / rate
              / ownership repeat identically down both lists below. */}
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <span className="flex items-center gap-1">
              Net transfers <InfoTooltip term="netTransfers" />
            </span>
            <span className="flex items-center gap-1">
              Rate/hr <InfoTooltip term="transferRate" />
            </span>
            <span className="flex items-center gap-1">
              Owned <InfoTooltip term="ownership" />
            </span>
          </div>

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
