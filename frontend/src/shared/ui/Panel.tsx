import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Summary panel with a title and one way out: a short readout of something
 * deeper, plus a link/button to the full thing. Extracted from LiveCockpit,
 * where it was the pattern that kept the home dashboard readable, so the squad
 * dashboard can use the same one.
 *
 * Two tones because the two surfaces differ: `hero` sits on the purple gradient
 * (translucent white borders, green CTA), `light` on the app's sunken grey.
 */
const TONES = {
  hero: {
    box: "rounded-lg border border-white/15 bg-surface/[0.07] p-3.5",
    title: "text-[10px] font-bold uppercase tracking-[0.1em] text-ink-300",
    cta: "tap-target inline-flex items-center text-[11px] font-semibold text-text-primary hover:underline",
  },
  light: {
    box: "rounded-lg border border-border bg-surface p-3.5 shadow-sm",
    title: "text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted",
    cta: "text-[11px] font-semibold text-text-primary hover:underline",
  },
} as const;

export function Panel({
  title,
  href,
  onAction,
  cta,
  tone = "light",
  children,
  className = "",
}: {
  title: string;
  /** Navigate away. Mutually exclusive with `onAction`. */
  href?: string;
  /** Stay put and switch view (e.g. select a tab in the same panel). */
  onAction?: () => void;
  cta?: string;
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`${t.box} ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className={t.title}>{title}</p>
        {cta && href && (
          <Link href={href} className={t.cta}>
            {cta} →
          </Link>
        )}
        {cta && !href && onAction && (
          <button type="button" onClick={onAction} className={t.cta}>
            {cta} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
