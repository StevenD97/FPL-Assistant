import Link from "next/link";
import { apiGet } from "@/shared/lib/api";
import type { AccuracyResponse, PlayerPredictedPoints, SeasonStatus } from "@/shared/types/api";

/**
 * The product working, before anyone is asked for anything.
 *
 * The landing page led with a claim ("Decisions, not gut feel"), three steps,
 * and a Team ID box. A first-time visitor had to hand over their team before
 * seeing a single thing the model could do - which is the wrong way round: the
 * ask should come after the demonstration, not before it.
 *
 * Everything here is real and current. This week's highest-projected captain
 * with the fixture behind it, and last finished gameweek's call graded against
 * what actually happened - including when it was wrong, which is the half that
 * makes the other half believable.
 *
 * Server-rendered, so it is in the HTML for a first visit and for indexing,
 * and it never blocks: each fetch degrades to nothing rather than taking the
 * page down.
 */
export async function WorkedExample() {
  const [picks, accuracy, season] = await Promise.all([
    apiGet<PlayerPredictedPoints[]>("/api/players/predicted-points?limit=3").catch(() => null),
    apiGet<AccuracyResponse>("/api/accuracy").catch(() => null),
    apiGet<SeasonStatus>("/api/season-status").catch(() => null),
  ]);

  const top = picks?.[0] ?? null;
  const lastGraded = accuracy?.events?.[0] ?? null;
  if (!top && !lastGraded) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-primary/60">
          See it work first
        </span>
        <h2 className="text-lg font-bold tracking-tight text-text-primary">
          No Team ID needed to check our homework.
        </h2>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {top && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              {season?.next_event != null ? `This week's captain call` : "This week's captain call"}
            </p>
            <p className="mt-1 text-md font-semibold text-text-primary">
              {top.web_name}
              <span className="ml-1.5 font-mono text-sm font-normal text-text-muted">
                {top.team_short}
              </span>
            </p>
            <p className="mt-0.5 text-sm leading-snug text-text-secondary">
              {top.predicted_points.toFixed(1)} points projected
              {top.next_opponent && top.next_opponent !== "BLANK"
                ? ` against ${top.next_opponent}`
                : ""}
              {season?.next_event != null ? ` in GW${season.next_event}` : ""} — the highest of any
              player in the game.
            </p>
          </div>
        )}

        {lastGraded && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
              Last week&apos;s call, graded
            </p>
            <p
              className={`mt-1 text-md font-semibold ${
                lastGraded.captain.rank_of_pick === 1 ? "text-success" : "text-danger"
              }`}
            >
              {lastGraded.captain.pick} scored {lastGraded.captain.actual}
            </p>
            <p className="mt-0.5 text-sm leading-snug text-text-secondary">
              {lastGraded.captain.rank_of_pick === 1
                ? `The highest-scoring player in the game in GW${lastGraded.event}.`
                : `${lastGraded.captain.rank_of_pick}th best that week — ${lastGraded.captain.best_actual_player} got ${lastGraded.captain.best_actual}. We publish the misses too.`}{" "}
              <Link href="/accuracy" className="font-semibold text-text-primary hover:underline">
                Full record →
              </Link>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
