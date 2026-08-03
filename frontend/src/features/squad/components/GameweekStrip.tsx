import type { PlannerResponse } from "@/shared/types/api";

/**
 * What a single gameweek looks like *for this squad* - not for the league. Two
 * managers reading the same gameweek have different problems depending on who
 * they own, which is exactly what makes this worth deriving per squad rather
 * than showing a generic fixture calendar.
 */
type GameweekShape = {
  event: number;
  /** Players with two or more fixtures - bench boost / triple captain territory. */
  doubles: number;
  /** Players with no fixture at all - the free hit case. */
  blanks: number;
  /** Squad total predicted points for the week. */
  points: number;
  squadSize: number;
};

/**
 * Fold the planner's per-player trajectories into one row per gameweek.
 *
 * The planner already returns everything needed - `next_events` for the columns
 * and each player's `trajectory[].fixture_count` - so this is a reshape of data
 * already on screen, not another request.
 */
export function summariseGameweeks(planner: PlannerResponse): GameweekShape[] {
  const byEvent = new Map<number, GameweekShape>();
  for (const event of planner.next_events) {
    byEvent.set(event, { event, doubles: 0, blanks: 0, points: 0, squadSize: 0 });
  }

  for (const player of planner.players) {
    for (const row of player.trajectory) {
      const shape = byEvent.get(row.event);
      if (!shape) continue;
      shape.squadSize++;
      shape.points += row.predicted_points;
      if (row.fixture_count === 0) shape.blanks++;
      else if (row.fixture_count >= 2) shape.doubles++;
    }
  }

  return planner.next_events.map((event) => byEvent.get(event)!).filter(Boolean);
}

/**
 * Which tone a gameweek earns.
 *
 * A week can hold doubles and blanks at once, so these are ranked rather than
 * mutually exclusive: whichever affects more of the squad sets the tone, and the
 * tile prints both counts regardless. Blanks win a tie because a missing fixture
 * costs points you were counting on, while a double is upside you can choose not
 * to use.
 */
function toneClass({ doubles, blanks }: GameweekShape): string {
  if (blanks === 0 && doubles === 0) return "";
  return blanks >= doubles ? "gw-tile-bgw" : "gw-tile-dgw";
}

/**
 * A scannable run of upcoming gameweeks, sized against its own container.
 *
 * This renders inside the Inspector, which is a narrow side column on desktop
 * and full width on a phone, so `@container/gwstrip` is what decides the tile
 * size - a viewport breakpoint would read "large screen" and pick wide tiles for
 * a 380px panel.
 *
 * The soonest gameweek is marked, and it's derived rather than passed in:
 * `next_events` holds only *future* weeks (with `planner.event` being the one
 * already in progress), so the first entry is always the next deadline and a
 * caller passing the current event would highlight nothing.
 */
export function GameweekStrip({ planner }: { planner: PlannerResponse }) {
  const weeks = summariseGameweeks(planner);
  if (weeks.length === 0) return null;

  const nextEvent = weeks[0].event;
  const hasAnyShape = weeks.some((w) => w.doubles > 0 || w.blanks > 0);

  return (
    <section className="@container/gwstrip" aria-label="Upcoming gameweeks at a glance">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-2xs font-bold uppercase tracking-[0.1em] text-text-muted">The next {weeks.length}</h4>
        {hasAnyShape && (
          <p className="text-3xs text-text-muted">
            <span className="font-semibold text-info">×2</span> doubles ·{" "}
            <span className="font-semibold text-warning">0</span> blanks
          </p>
        )}
      </div>

      {/* A list, not a table: each tile is one gameweek read on its own. */}
      <ul className="flex gap-1.5 overflow-x-auto pb-1">
        {weeks.map((w) => (
          <li
            key={w.event}
            className={`gw-tile ${toneClass(w)} ${
              w.event === nextEvent ? "gw-tile-next" : ""
            } flex min-w-[clamp(3.25rem,15cqw,4.5rem)] flex-1 flex-col items-center gap-0.5 px-1.5 py-2`}
          >
            <span className="text-3xs font-bold uppercase tracking-wide text-text-muted">GW{w.event}</span>
            <span className="font-mono text-sm font-bold leading-none text-text-primary @[420px]/gwstrip:text-md">
              {w.points.toFixed(0)}
            </span>
            {/* Only the exceptions get a marker. A normal week showing "0 doubles,
                0 blanks" would be noise in a strip whose job is spotting the odd
                one out. */}
            <span className="flex min-h-[14px] items-center gap-1">
              {w.doubles > 0 && (
                <span className="font-mono text-3xs font-bold text-info" title={`${w.doubles} with a double gameweek`}>
                  ×2·{w.doubles}
                </span>
              )}
              {w.blanks > 0 && (
                <span className="font-mono text-3xs font-bold text-warning" title={`${w.blanks} with no fixture`}>
                  0·{w.blanks}
                </span>
              )}
            </span>
            {/* The visible tile is glyphs and colour; this is the same thing in
                words, for a reader who gets neither. */}
            <span className="sr-only">
              {`Gameweek ${w.event}: ${w.points.toFixed(0)} predicted points`}
              {w.doubles > 0 ? `, ${w.doubles} of ${w.squadSize} with a double gameweek` : ""}
              {w.blanks > 0 ? `, ${w.blanks} of ${w.squadSize} with no fixture` : ""}
              {w.event === nextEvent ? ", next deadline" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
