import type { HTMLAttributes, ReactNode } from "react";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  active?: boolean;
  children: ReactNode;
};

export function Card({ padded = true, active = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg border bg-surface shadow-sm ${active ? "border-brand" : "border-border"} ${
        padded ? "p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Compact stat readout: uppercase muted label over a bold monospace number,
// on a sunken tile. The number carries the weight (design prototype rule).
export function StatTile({
  label,
  value,
  tooltip,
  tooltipText,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Key into STAT_GLOSSARY - shows an "i" info trigger next to the label. */
  tooltip?: StatGlossaryKey;
  /** One-off explanation text, for labels not in the shared glossary. */
  tooltipText?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-sunken p-3">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {label}
        {(tooltip || tooltipText) && <InfoTooltip term={tooltip} text={tooltipText} />}
      </span>
      <span className="font-mono text-md font-bold text-text-primary">{value}</span>
    </div>
  );
}
