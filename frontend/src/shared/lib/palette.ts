// Distinct line colors for multi-series charts (league trend lines) - PL
// brand accents first, then a few extra hues so up to ~10 series stay
// visually distinguishable before repeating.
const PALETTE = [
  "#37003C", // brand
  "#00A651", // success green
  "#0057B8", // info blue
  "#E90052", // danger
  "#B9770E", // warning amber
  "#04A5B0", // teal
  "#8B5CF6", // violet
  "#DA291C", // red
  "#52525E", // ink-600
  "#0A7534", // pitch-green-2
];

export function seriesColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
