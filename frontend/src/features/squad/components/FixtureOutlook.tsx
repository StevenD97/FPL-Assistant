"use client";

import { FdrChip } from "@/shared/ui/FdrChip";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { EASY_FIXTURE_THRESHOLD, TOUGH_FIXTURE_THRESHOLD } from "../diagnostics";
import type { FixtureOutlookRow, PlannerResponse, SquadPlayer } from "@/shared/types/api";

/**
 * The schedule your squad is actually walking into, per club.
 *
 * The payload behind this has been arriving with every squad load all along -
 * `/api/squad/{team_id}` returns `fixture_outlook` (see
 * fpl/domain/squad.py) with each club's average FDR over the window, its
 * fixture ticker, and per-fixture difficulty - and nothing rendered it. The
 * feedback asked for the 5-gameweek average FDR plus the standout players on a
 * good run, which is exactly what was already on the wire.
 *
 * Grading uses the builder's own thresholds (see diagnostics.ts) rather than a
 * second set, so "kind run" means one thing across the app.
 */

/** Who in the squad plays for this club, so a run reads as players rather than a code. */
function playersFor(club: string, squad: SquadPlayer[]): SquadPlayer[] {
  return squad.filter((p) => p.team_short === club);
}

function toneFor(avg: number | null): { label: string; text: string; dot: string } {
  if (avg == null) return { label: "Unknown", text: "text-text-muted", dot: "bg-ink-300" };
  if (avg <= EASY_FIXTURE_THRESHOLD) return { label: "Kind", text: "text-success", dot: "bg-success" };
  if (avg >= TOUGH_FIXTURE_THRESHOLD) return { label: "Tough", text: "text-danger", dot: "bg-danger" };
  return { label: "Average", text: "text-text-secondary", dot: "bg-ink-400" };
}

/**
 * The "schedule highlights" half of the feedback: not just which clubs have a
 * kind run, but who to actually back through it.
 *
 * A kind run only matters if you own someone worth starting in it, so the two
 * halves are joined here - `fixture_outlook` supplies the run, the planner's
 * `average_predicted_points` supplies the player worth naming. Sorted by
 * projected points rather than by fixture ease, because among players who all
 * have the same kind run the question is which one scores.
 */
function highlights(
  outlook: FixtureOutlookRow[],
  squad: SquadPlayer[],
  planner: PlannerResponse | null,
): { player: SquadPlayer; club: string; avg: number; xp: number | null }[] {
  const kindClubs = outlook.filter(
    (row) => row.avg_difficulty != null && row.avg_difficulty <= EASY_FIXTURE_THRESHOLD,
  );
  const xpByLiveId = new Map(planner?.players.map((p) => [p.id, p.average_predicted_points]) ?? []);

  return kindClubs
    .flatMap((row) =>
      playersFor(row.team_short, squad).map((player) => ({
        player,
        club: row.team_short,
        avg: row.avg_difficulty as number,
        // Planner rows are keyed by live element id; SquadPlayer.live_id is null
        // for anyone no longer in the live game, who therefore has no projection.
        xp: player.live_id != null ? xpByLiveId.get(player.live_id) ?? null : null,
      })),
    )
    .sort((a, b) => (b.xp ?? -1) - (a.xp ?? -1))
    .slice(0, 4);
}

/** One-line readout for the rail: the extremes, which is what a glance wants. */
export function fixtureOutlookSummary(outlook: FixtureOutlookRow[]) {
  const graded = outlook.filter((r) => r.avg_difficulty != null);
  if (graded.length === 0) return null;
  const sorted = [...graded].sort((a, b) => (a.avg_difficulty as number) - (b.avg_difficulty as number));
  return { kindest: sorted[0], toughest: sorted[sorted.length - 1] };
}

export function FixtureOutlook({
  outlook,
  squad,
  planner,
  windowLabel,
}: {
  outlook: FixtureOutlookRow[];
  squad: SquadPlayer[];
  planner: PlannerResponse | null;
  /** e.g. "next 5 gameweeks" - stated rather than assumed, since the window is a parameter. */
  windowLabel: string;
}) {
  if (outlook.length === 0) {
    return <p className="text-sm text-text-muted">No fixture outlook for this squad yet.</p>;
  }

  // Ascending: the kind runs are the actionable end, so they lead.
  const rows = [...outlook].sort(
    (a, b) => (a.avg_difficulty ?? 6) - (b.avg_difficulty ?? 6),
  );
  const picks = highlights(outlook, squad, planner);

  return (
    <div>
      <p className="mb-3 text-xs text-text-muted">
        Every club you own, easiest run first, across the {windowLabel}. Average FDR{" "}
        <InfoTooltip term="avgFdr" /> grades the whole run; the chips are the fixtures behind it.
      </p>

      {picks.length > 0 && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success-bg/40 px-3 py-2.5">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-success">
            Back these through the good run
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picks.map(({ player, club, avg, xp }) => (
              <span
                key={player.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                title={`${club} average FDR ${avg.toFixed(1)} across the ${windowLabel}`}
              >
                <span className="font-semibold text-text-primary">{player.web_name}</span>
                <span className="font-mono text-text-muted">{club}</span>
                {xp != null && (
                  <span className="font-mono font-semibold text-text-primary">{xp.toFixed(1)} xP/GW</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {rows.map((row) => {
          const tone = toneFor(row.avg_difficulty);
          const owned = playersFor(row.team_short, squad);
          return (
            <li key={row.team_short} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {row.team_badge && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.team_badge} alt="" className="h-6 w-6 shrink-0 object-contain" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">{row.team_short}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {owned.map((p) => p.web_name).join(", ") || "—"}
                  </span>
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                <span className={`font-mono text-sm font-semibold ${tone.text}`}>
                  {row.avg_difficulty?.toFixed(1) ?? "—"}
                </span>
                <span className={`text-xs font-bold uppercase tracking-wide ${tone.text}`}>{tone.label}</span>
              </span>

              <span className="flex flex-wrap gap-1">
                {row.fixtures.map((fx, i) => (
                  <FdrChip
                    key={i}
                    opponent={fx.opponent}
                    isHome={fx.is_home}
                    difficulty={fx.difficulty}
                    badgeUrl={fx.opponent_badge}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
