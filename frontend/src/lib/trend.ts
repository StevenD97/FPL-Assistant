// Least-squares linear trend line through a set of {x, y} points -
// returns just the two endpoints, enough to draw a straight line across
// the same x-range as the data it's summarizing.
export function linearTrend(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const n = points.length;
  if (n < 2) return [];

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return [];

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  return [
    { x: xMin, y: slope * xMin + intercept },
    { x: xMax, y: slope * xMax + intercept },
  ];
}
