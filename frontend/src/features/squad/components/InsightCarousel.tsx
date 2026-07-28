"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/Button";
import { CompareArrow } from "@/shared/ui/CompareArrow";
import { FdrChip } from "@/shared/ui/FdrChip";
import type { Insight, Tone } from "../diagnostics";

// One piece of squad feedback, shown one at a time in the Feedback carousel.
// "positive"/"warning"/"info" drive the card's accent color; the optional
// fields render the supporting evidence (fixtures, a stat comparison, or a
// minutes-share gauge) as actual UI instead of a number-stuffed sentence.
const TONE_META: Record<Tone, { label: string; barClass: string; textClass: string }> = {
  positive: { label: "Strength", barClass: "bg-success", textClass: "text-success" },
  warning: { label: "Needs attention", barClass: "bg-warning", textClass: "text-warning" },
  info: { label: "Worth knowing", barClass: "bg-pl-purple", textClass: "text-pl-purple" },
};

// Minutes-share readout for rotation-risk cards - a filled bar reads faster
// than "~63% of a nailed starter's minutes" buried in a sentence.
function InsightGauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-3">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-warning" style={{ width: `${clamped}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-text-muted">~{clamped}% of a nailed starter&apos;s minutes recently</p>
    </div>
  );
}

// Value-vs-average readout, shared by the per-player and per-position stat
// insights - the actual numbers plus a CompareArrow, instead of both figures
// stuffed into one sentence.
function InsightStat({ stat }: { stat: NonNullable<Insight["stat"]> }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md bg-surface-sunken px-3 py-2">
      <span className="font-mono text-lg font-bold text-text-primary">
        {stat.value.toFixed(2)}
        {stat.unit}
      </span>
      <CompareArrow value={stat.value} baseline={stat.avg} />
      <span className="text-xs text-text-muted">
        vs {stat.avg.toFixed(2)}
        {stat.unit} average
      </span>
    </div>
  );
}

function InsightCard({ insight, onAddPlayer }: { insight: Insight; onAddPlayer: (id: number) => void }) {
  const meta = TONE_META[insight.tone];
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-white p-5 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-1 ${meta.barClass}`} aria-hidden="true" />
      <div className="flex items-start gap-3">
        {insight.badgeUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={insight.badgeUrl} alt="" className="mt-0.5 h-7 w-7 shrink-0 object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${meta.textClass}`}>{meta.label}</span>
          <h3 className="mt-0.5 font-semibold text-text-primary">{insight.title}</h3>
          <p className="mt-1 text-sm text-text-secondary">{insight.detail}</p>
          {insight.fixtures && insight.fixtures.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {insight.fixtures.map((fx, i) => (
                <FdrChip key={i} opponent={fx.opponent} isHome={fx.is_home} difficulty={fx.difficulty} badgeUrl={fx.opponent_badge} />
              ))}
            </div>
          )}
          {insight.stat && <InsightStat stat={insight.stat} />}
          {insight.gauge && <InsightGauge pct={insight.gauge.pct} />}
          {insight.suggestions && insight.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {insight.suggestions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onAddPlayer(p.id)}
                  className="rounded-sm border border-border-strong px-2 py-1 text-xs text-text-primary hover:bg-slate-50"
                >
                  + {p.web_name} ({p.team_short}, £{p.cost.toFixed(1)}m, {p.predicted_points.toFixed(1)} pts)
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Feedback surfaces one insight at a time with Prev/Next, rather than the
// old wall of stacked alert boxes - easier to actually read through, and it
// gives positive callouts equal billing instead of burying them at the end.
export function InsightCarousel({ insights, onAddPlayer }: { insights: Insight[]; onAddPlayer: (id: number) => void }) {
  const [index, setIndex] = useState(0);
  const clamped = Math.min(index, insights.length - 1);

  return (
    <div>
      <InsightCard insight={insights[clamped]} onAddPlayer={onAddPlayer} />
      <div className="mt-3 flex items-center justify-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={clamped === 0}>
          ← Previous
        </Button>
        <span className="font-mono text-xs text-text-muted">
          {clamped + 1} / {insights.length}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setIndex((i) => Math.min(insights.length - 1, i + 1))}
          disabled={clamped === insights.length - 1}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
