/**
 * The ownership ceilings that define a "differential", shared by every surface
 * that offers the choice.
 *
 * These used to live as a private constant on the players page. The squad page
 * now offers the same choice, and two hardcoded ladders would eventually drift -
 * at which point "< 10%" would mean different things on two screens with no way
 * for the reader to tell.
 *
 * The bands are also the app's risk-appetite control, which is what the feedback
 * actually asked for: a lower ceiling is a bolder pick, because fewer rivals own
 * the player and the swing against them is bigger in both directions. `risk`
 * names that trade-off so a UI can say what the number means.
 */

export type OwnershipKey = "any" | "lt5" | "lt10" | "lt15";

export type OwnershipBand = {
  key: OwnershipKey;
  label: string;
  /** Inclusive ownership ceiling in percent; null means no filter at all. */
  max: number | null;
  /** How bold this ceiling is, for UI that frames it as risk rather than a filter. */
  risk: string;
};

export const OWNERSHIP_BANDS: OwnershipBand[] = [
  { key: "any", label: "Any", max: null, risk: "no ceiling" },
  { key: "lt5", label: "< 5%", max: 5, risk: "bold" },
  { key: "lt10", label: "< 10%", max: 10, risk: "balanced" },
  { key: "lt15", label: "< 15%", max: 15, risk: "cautious" },
];

/**
 * The bands that actually express an appetite. "Any" is a valid filter on a
 * browse page but not a risk setting - "differentials, no ownership limit" is
 * every player in the game.
 */
export const RISK_BANDS: OwnershipBand[] = OWNERSHIP_BANDS.filter((b) => b.max != null);

/** Matches the players page's Differentials lens, so the two agree by default. */
export const DEFAULT_RISK_KEY: OwnershipKey = "lt10";

export function ownershipMaxFor(key: OwnershipKey): number | null {
  return OWNERSHIP_BANDS.find((b) => b.key === key)?.max ?? null;
}

/**
 * The ceiling to actually filter by, for callers that need a number rather than
 * "no ceiling". Falls back to the default band instead of a literal, so the
 * fallback can't drift away from DEFAULT_RISK_KEY the way two copies of `10`
 * eventually would.
 */
export function riskCeilingFor(key: OwnershipKey): number {
  return ownershipMaxFor(key) ?? (ownershipMaxFor(DEFAULT_RISK_KEY) as number);
}
