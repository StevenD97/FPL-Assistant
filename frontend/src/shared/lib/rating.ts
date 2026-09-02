/**
 * Turning a raw stat into a 0-99 rating without making the number up.
 *
 * A FIFA-style card wants ratings, but FPL stats don't come on a 0-99 scale and
 * inventing one produces a figure that looks authoritative and means nothing -
 * which is why PlayerCard's headline deliberately stayed as raw xPts.
 *
 * Percentile against the actual player pool is a real measurement: 87 means
 * "better than 87% of players on this stat". It also survives how skewed these
 * distributions are - predicted points has a median of ~4 against a max of ~31,
 * so a linear min-to-max scale would put the median player at 13/99 and cram
 * everyone interesting into the top fifth of the dial.
 */

/** Highest rating we award, so the dial reads 0-99 like the cards it echoes. */
const MAX_RATING = 99;

/**
 * Values to compare against, sorted ascending once so repeated lookups are cheap.
 * Build it with `makeScale`.
 */
export type RatingScale = { sorted: number[] };

export function makeScale(values: number[]): RatingScale {
  return { sorted: [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b) };
}

/**
 * Where `value` sits in the pool, 0-99.
 *
 * Ties take their midrank rather than the bottom or top of the run: with 100
 * players on exactly zero, "bottom of the tie" would rate them all 0 and "top"
 * would rate them all 18, and neither is more true than the middle.
 */
export function percentileRating(value: number, scale: RatingScale): number | null {
  const { sorted } = scale;
  if (!Number.isFinite(value) || sorted.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  const midrank = below + equal / 2;
  return Math.round((midrank / sorted.length) * MAX_RATING);
}

/**
 * Rating from a known domain, for stats with a real ceiling rather than a
 * distribution - expected minutes can only run 0-90, so a percentile would say
 * less than the plain proportion does.
 *
 * `invert` is for stats where low is good (rotation risk): without it a dial
 * would read 99 for the worst possible player, which is worse than showing
 * nothing.
 */
export function domainRating(
  value: number,
  { min = 0, max, invert = false }: { min?: number; max: number; invert?: boolean },
): number | null {
  if (!Number.isFinite(value) || max <= min) return null;
  const clamped = Math.min(Math.max(value, min), max);
  const fraction = (clamped - min) / (max - min);
  return Math.round((invert ? 1 - fraction : fraction) * MAX_RATING);
}

/**
 * Whether a stat is worth a dial at all.
 *
 * A stat that's zero for every player in the set carries no information, and an
 * empty ring reads as "this player has none" rather than "we don't have this" -
 * the demo squad has no form or rotation-risk values at all, which would have
 * shipped three flat dials out of six. Suppressing the stat is the honest
 * outcome; the reader loses nothing that was there.
 */
export function hasSignal(values: number[]): boolean {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return false;
  return finite.some((v) => v !== 0) && new Set(finite).size > 1;
}

/**
 * The three-word answer, which is all a percentile can honestly support.
 *
 * A dial reading 87 next to one reading 84 invites a reader to believe there
 * is a difference between them. There isn't one they can act on: the
 * underlying stats are noisy, the pool shifts every gameweek, and three points
 * of percentile is well inside that. Six such dials on a card is six invented
 * distinctions.
 *
 * The bands match the meter's existing colour steps exactly, so the word and
 * the colour say the same thing rather than two slightly different things. The
 * raw figure stays on screen underneath and the exact percentile stays in the
 * accessible label - nothing is hidden, it just stops being the headline.
 */
export type RatingBand = "Low" | "Solid" | "Elite";

export function ratingBand(rating: number): RatingBand {
  if (rating <= 39) return "Low";
  if (rating <= 69) return "Solid";
  return "Elite";
}
