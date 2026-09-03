import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import { ratingBand } from "@/shared/lib/rating";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

/**
 * A rating as a radial meter: one value against a fixed limit.
 *
 * Deliberately a meter and not a donut chart. A donut splits a whole into
 * segments you compare against each other; this is a single ratio against a
 * ceiling, which is the meter's job - the arc carries the magnitude and the track
 * carries the limit. Two-slice donuts are the classic way to get this wrong.
 *
 * One hue, three steps by band, validated against the card's dark surface
 * (monotone lightness, 4° hue spread, lightest step 3.17:1). Colour and arc both
 * encode the same magnitude on purpose: at 44px the arc alone is a coarse read,
 * and the band lets a row of dials be scanned for the strong ones. The number
 * stays in card ink rather than the series colour.
 */

/** Low → high steps of a single green ramp; see the validated palette above. */
const BANDS = [
  { upTo: 39, fill: "#0e7a48" },
  { upTo: 69, fill: "#00c76a" },
  { upTo: 99, fill: "var(--success)" },
] as const;

function bandFill(rating: number): string {
  return (BANDS.find((b) => rating <= b.upTo) ?? BANDS[BANDS.length - 1]).fill;
}

export function StatMeter({
  label,
  rating,
  value,
  tooltip,
  size = 44,
}: {
  label: string;
  /** 0-99. Derived, never invented - see lib/rating.ts. */
  rating: number;
  /** The underlying figure, kept visible so the rating is never the only truth. */
  value: string;
  tooltip?: StatGlossaryKey;
  size?: number;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(rating, 0), 99);
  const fill = bandFill(clamped);

  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0 -rotate-90"
        role="img"
        aria-label={`${label}: ${ratingBand(clamped)}, ${clamped} out of 99 (${value})`}
      >
        {/* Track: the same hue at its lowest step, so the limit reads as part of
            the same scale rather than as a foreign grey. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0e7a48"
          strokeOpacity={0.35}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 99)}
        />
      </svg>
      {/* The band, not the number. A dial reading 87 beside one reading 84
          invites a distinction the underlying percentile cannot support - see
          ratingBand. The raw figure is still directly underneath, and the
          exact percentile is still in the accessible label. */}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-xs font-bold text-white">{ratingBand(clamped)}</span>
        <span className="flex items-center gap-0.5 truncate text-xs font-semibold uppercase tracking-wide text-ink-300">
          {label}
          {tooltip && (
            <InfoTooltip
              term={tooltip}
              className="border-white/40 text-white/70 hover:border-white hover:bg-surface/20 hover:text-white"
            />
          )}
        </span>
        <span className="truncate font-mono text-xs text-white/70">{value}</span>
      </span>
    </div>
  );
}
