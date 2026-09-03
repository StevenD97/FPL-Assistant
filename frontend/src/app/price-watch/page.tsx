import { Alert } from "@/shared/ui/Alert";
import { Card } from "@/shared/ui/Card";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { apiGet } from "@/shared/lib/api";
import { MoverList } from "@/features/players/MoverList";
import type { PriceWatchResponse } from "@/shared/types/api";

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
  // The headline this page never had: how many are actually over the line
  // right now. Everything below is a ranking; this is the news.
  const aboutToChange = [...risers, ...fallers].filter((m) => m.about_to_change).length;

  return (
    <PageContainer>
      <PageHeader
        title="Price watch"
        subtitle="How close each player is to a £0.1m price change at tonight's update (~2:30am UK), using FPL's own progress figure - refreshed every fifteen minutes. Anything at 100% is over the line; FPL can still change its mind."
        action={
          aboutToChange > 0 ? (
            <span className="font-mono text-sm font-semibold text-text-primary">
              {aboutToChange} changing tonight
            </span>
          ) : undefined
        }
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
              <MoverList movers={risers} sign="+" emptyLabel="No riser activity yet." />
            </Card>

            <Card padded={false} className="overflow-hidden">
              <div className="border-b border-border px-3.5 py-3">
                <h2 className="text-md font-semibold text-text-primary">Likely fallers</h2>
              </div>
              <MoverList movers={fallers} sign="-" emptyLabel="No faller activity yet." />
            </Card>
          </div>
        </>
      )}
    </PageContainer>
  );
}
