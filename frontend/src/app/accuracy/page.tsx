import { Alert } from "@/shared/ui/Alert";
import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { apiGet } from "@/shared/lib/api";
import type { AccuracyResponse, AccuracyResponseEvent, ReturnCategory } from "@/shared/types/api";

// Grades change whenever a gameweek finishes, and the backend caches them
// anyway, so this is per-request. force-dynamic also keeps `next build` from
// calling the backend - the same guard the other data pages use.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Model accuracy · xFPL",
  description:
    "Every gameweek call this model has made, graded against what actually happened. Including the bad ones.",
};

export default async function AccuracyPage() {
  let data: AccuracyResponse | null = null;
  let error: string | null = null;
  try {
    data = await apiGet<AccuracyResponse>("/api/accuracy");
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong";
  }

  const summary = data?.summary ?? null;
  const events = data?.events ?? [];
  const pending = data?.coverage.pending ?? [];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Track record"
        title="How accurate is this, really?"
        subtitle="Every gameweek, the model's ranking is checked against what actually happened. Each prediction uses only data available before that gameweek's deadline - no hindsight, no re-fitting - and the weeks it got wrong are here too."
      />

      {error && <Alert kind="warning">Couldn&apos;t load the record ({error}).</Alert>}

      {!error && !summary && (
        <Alert kind="info">
          Nothing to grade yet. The first entry appears once a gameweek has finished.
        </Alert>
      )}

      {summary && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Headline
              label="Captain pick"
              value={`${summary.captain_average.toFixed(1)} pts`}
              hint={`per week · the best possible was ${summary.captain_best_possible_average.toFixed(1)}`}
            />
            <Headline
              label="Top ten picks"
              value={`${summary.top_ten_average.toFixed(1)} pts`}
              hint={`each · everyone who played averaged ${summary.field_average.toFixed(1)}`}
            />
            <Headline
              label="Ranking"
              value={summary.rank_correlation != null ? summary.rank_correlation.toFixed(2) : "—"}
              hint="0 is a coin toss, 1 is a perfect order"
            />
            <Headline
              label="Weeks graded"
              value={String(summary.events_graded)}
              hint={pending.length > 0 ? `GW${pending.join(", GW")} still to grade` : "every finished week"}
            />
          </section>

          <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
            Only players who actually appeared are counted. Grading everyone would fold in
            several hundred who scored nothing and were predicted to score nothing, which
            flatters any model and tells a manager nothing.
          </p>

          {summary.categories.length > 0 && <CategoryTable rows={summary.categories} />}

          <div className="flex flex-col gap-3">
            {events.map((e) => (
              <GameweekCard key={e.event} e={e} />
            ))}
          </div>
        </>
      )}
    </PageContainer>
  );
}

// What each category means in plain words, and why a reader should care about
// it separately. A single pooled error figure hides the only distinction that
// matters: knowing who will blank is easy and nearly worthless, knowing who
// will haul is hard and decides gameweeks.
const CATEGORY_COPY: Record<string, { label: string; meaning: string }> = {
  Blanks: { label: "Blanks", meaning: "played, returned 2 or fewer" },
  Tickers: { label: "Tickers", meaning: "3 or 4 points" },
  Haulers: { label: "Haulers", meaning: "5 or more - the weeks that decide things" },
  All: { label: "Everyone", meaning: "every player who appeared" },
};

function CategoryTable({ rows }: { rows: ReturnCategory[] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <h2 className="text-md font-semibold text-text-primary">Against the obvious alternative</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
        A projection is only worth having if it beats what you could do without one. The bar
        here is the simplest thing that works: assume a player scores what they averaged over
        their last five matches. Lower is better, and the numbers are average error in points.
      </p>

      {/* Deliberately not a table. The verdict is the column a reader came for,
          and at 390px a table wide enough to hold five columns puts it behind a
          horizontal scroll - which is the same as not showing it. */}
      <ul className="mt-3 flex flex-col">
        {rows.map((row) => {
          const beats = row.rmse < row.baseline_rmse;
          const margin = Math.round(Math.abs(1 - row.rmse / row.baseline_rmse) * 100);
          const copy = CATEGORY_COPY[row.category] ?? { label: row.category, meaning: "" };
          return (
            <li
              key={row.category}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/60 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-text-primary">{copy.label}</span>
                <span className="block text-xs leading-snug text-text-muted">{copy.meaning}</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-semibold ${beats ? "text-success" : "text-danger"}`}>
                  {beats ? `${margin}% better` : `${margin}% worse`}
                </span>
                <span className="block font-mono text-xs leading-snug text-text-muted">
                  {row.rmse.toFixed(2)} vs {row.baseline_rmse.toFixed(2)} · {row.n} players
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-text-muted">
        Haulers is the hard row, and the one to watch. Predicting a player&apos;s average week
        is a different problem from predicting their best one, and every model in this space -
        including the published state of the art - closes far less of the gap there than it
        does elsewhere.
      </p>
    </section>
  );
}

function GameweekCard({ e }: { e: AccuracyResponseEvent }) {
  const captainNailed = e.captain.rank_of_pick === 1;
  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-md font-semibold text-text-primary">Gameweek {e.event}</h2>
        <span className="font-mono text-xs text-text-muted">{e.players_graded} players appeared</span>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <Row
          label="Captain call"
          value={`${e.captain.pick} scored ${e.captain.actual}`}
          detail={
            captainNailed
              ? "the highest-scoring player in the game that week"
              : `${ordinal(e.captain.rank_of_pick)} highest that week · best was ${e.captain.best_actual_player} on ${e.captain.best_actual}`
          }
          good={e.captain.actual * 2 >= e.captain.best_actual}
        />
        <Row
          label="Top ten"
          value={`${e.top_ten.average_actual.toFixed(1)} pts each`}
          detail={`against ${e.top_ten.field_average.toFixed(1)} across everyone who played`}
          good={e.top_ten.average_actual > e.top_ten.field_average}
        />
        <Row
          label="Ranking"
          value={e.rank_correlation != null ? e.rank_correlation.toFixed(2) : "—"}
          detail="rank correlation with the real order"
          good={(e.rank_correlation ?? 0) >= 0.2}
        />
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-text-muted">
        Ten highest projected: {e.top_ten.names.join(", ")}
      </p>
    </article>
  );
}

function Headline({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3.5 py-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl font-extrabold text-pl-purple">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-text-muted">{hint}</p>
    </div>
  );
}

function Row({
  label,
  value,
  detail,
  good,
}: {
  label: string;
  value: string;
  detail: string;
  good: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${good ? "text-success" : "text-danger"}`}>{value}</dd>
      <dd className="mt-0.5 text-xs leading-snug text-text-muted">{detail}</dd>
    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}
