import type { ButtonHTMLAttributes } from "react";

// Rounded toggle/filter pill (used for position filters, sort keys, view
// switches). Active = solid purple; inactive = outlined white.
type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean };

export function Pill({ active = false, className = "", children, ...rest }: PillProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-pl-purple bg-pl-purple text-white"
          : "border-border-strong bg-white text-text-secondary hover:border-pl-purple/40"
      } ${className}`}
    >
      {children}
    </button>
  );
}
