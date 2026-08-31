import type { ScheduleFixture } from "@/shared/types/api";

/**
 * Which of the three states a fixture is in.
 *
 * FPL exposes this across three separate flags, and `finished` is the wrong
 * one to read on its own: it stays false until the whole gameweek is
 * processed and bonus is confirmed, which is routinely a day or two after
 * the final whistle. Two gameweeks into 2026/27 every played GW2 match was
 * `finished: false, finished_provisional: true` with a real 90-minute score,
 * so keying off `finished` showed a kickoff time for matches that had ended
 * two days earlier. `finished_provisional` is what flips at full time.
 */
export type FixtureState = "scheduled" | "live" | "result";

export function fixtureState(fx: ScheduleFixture): FixtureState {
  if (fx.finished || fx.finished_provisional) return "result";
  if (fx.started) return "live";
  return "scheduled";
}

/** A score is on the board — the match is in progress or done. */
export function hasScore(fx: ScheduleFixture): boolean {
  return fixtureState(fx) !== "scheduled";
}

/** The first gameweek that still has a match without a final result. */
export function currentEvent(fixtures: ScheduleFixture[]): number | null {
  return fixtures.find((fx) => fixtureState(fx) !== "result")?.event ?? null;
}
