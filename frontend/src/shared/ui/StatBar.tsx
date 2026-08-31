import type { ReactNode } from "react";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

export type StatBarItem = {
  label: string;
  value: ReactNode;
  /** Context line under the number - what it's measured against. */
  hint?: ReactNode;
  tooltip?: StatGlossaryKey;
  tooltipText?: string;
};

/**
 * A run of headline stats as one banded bar rather than a row of detached
 * tiles. Four equal StatTiles gave four equal-weight numbers with no reading
 * order; here the first item is the headline (larger, accented) and the rest
 * support it, which is the hierarchy the design system's "the number carries
 * the weight" rule implies.
 *
 * The hairlines are a 1px grid gap with the border colour showing through the
 * container, so they land correctly in both the 2-up mobile and 4-up desktop
 * layouts without any nth-child correction.
 */
export function StatBar({ items, className = "" }: { items: StatBarItem[]; className?: string }) {
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-sm sm:grid-cols-4 ${className}`}
    >
      {items.map((item, i) => (
        <div key={item.label} className="relative bg-white px-4 pb-3 pt-3.5">
          {/* Accent on the headline only - it establishes which number to read
              first without colour-coding all four into noise. */}
          {i === 0 && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-pl-purple" />}
          <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-text-muted">
            {item.label}
            {(item.tooltip || item.tooltipText) && (
              <InfoTooltip term={item.tooltip} text={item.tooltipText} />
            )}
          </dt>
          <dd
            className={`mt-1 font-mono font-bold tabular-nums text-pl-purple ${
              i === 0 ? "text-2xl leading-none" : "text-md leading-tight"
            }`}
          >
            {item.value}
          </dd>
          {item.hint && <p className="mt-1 text-[11px] leading-tight text-text-muted">{item.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
