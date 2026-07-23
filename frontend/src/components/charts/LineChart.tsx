type Point = { x: number; y: number };
type Series = { label: string; color: string; points: Point[] };

const VIEW_WIDTH = 640;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

export function LineChart({
  series,
  height = 220,
  showLegend = true,
}: {
  series: Series[];
  height?: number;
  showLegend?: boolean;
}) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return <p className="text-sm text-text-muted">No data to chart yet.</p>;
  }

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys) || 1;

  const plotW = VIEW_WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  function toSvgX(x: number) {
    return PAD.left + (xMax === xMin ? plotW / 2 : ((x - xMin) / (xMax - xMin)) * plotW);
  }
  function toSvgY(y: number) {
    return PAD.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v));

  return (
    <div>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} className="w-full" style={{ height }}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={VIEW_WIDTH - PAD.right}
              y1={toSvgY(tick)}
              y2={toSvgY(tick)}
              stroke="#dfdfe6"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={toSvgY(tick) + 3} textAnchor="end" fontSize={10} fill="#71717f">
              {tick}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <polyline
            key={s.label}
            points={s.points.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      {showLegend && series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
