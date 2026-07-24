import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  active?: boolean;
  children: ReactNode;
};

export function Card({ padded = true, active = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={`rounded-lg border bg-white shadow-sm ${active ? "border-pl-purple" : "border-border"} ${
        padded ? "p-5" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

// Compact stat readout: uppercase muted label over a bold monospace number,
// on a sunken tile. The number carries the weight (design prototype rule).
export function StatTile({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-sunken p-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">{label}</span>
      <span className="font-mono text-md font-bold text-pl-purple">{value}</span>
    </div>
  );
}
