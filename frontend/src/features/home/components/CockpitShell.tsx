import Link from "next/link";
import { Countdown, DeadlineLabel } from "@/shared/ui/Countdown";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

/**
 * The purple hero treatment, reused by both cockpit states so the page keeps
 * the same shape pre-season and once the season is live - it fills in rather
 * than changing shape at GW1.
 */
export function CockpitShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-fpl-hero relative overflow-hidden rounded-lg p-6 text-white lg:p-8">
      {/* The green bloom the hero and every blog cover share. */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(0,255,135,0.28),transparent_70%)]" />

      <div className="relative flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* A manager's team name is theirs, and seeing it cut to "Ready when
              you are, St…" reads as a bug in the first two seconds. It wraps
              instead of truncating, and the deadline tile drops below it on a
              phone rather than squeezing it. */}
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-pl-green">
              {eyebrow}
            </span>
            <h1 className="mt-1 text-balance break-words text-2xl font-bold leading-tight tracking-tight lg:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-1 text-sm text-[#e6d4ea]">{subtitle}</p>}
          </div>

          <Link
            href="/squad"
            className="min-h-[44px] shrink-0 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-right transition-colors hover:bg-white/15"
          >
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-pl-green">
              Deadline
            </span>
            <Countdown className="block text-lg font-bold text-white" />
            <span className="block text-[10px] text-[#c9a9d1]"><DeadlineLabel /></span>
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}

/** A translucent stat tile for use on the purple hero. */
export function CockpitStat({
  label,
  value,
  hint,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Key into STAT_GLOSSARY - shows an "i" info trigger next to the label. */
  tooltip?: StatGlossaryKey;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-white/15 bg-white/10 px-3.5 py-3">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#c9a9d1]">
        {label}
        {tooltip && (
          <InfoTooltip
            term={tooltip}
            className="border-white/40 text-white/70 hover:border-white hover:bg-white/20 hover:text-white"
          />
        )}
      </p>
      {/* Every value renders at the same size in the same fixed-height box, so
          the four read as one row of numbers rather than drifting off each
          other's baseline when one holds a name instead of a figure. */}
      <p className="mt-1 flex h-6 items-center truncate font-mono text-xl font-extrabold leading-none text-white">
        {value}
      </p>
      {/* Reserved whether or not there's a hint, so tiles with one don't sit
          taller than the rest. */}
      <p className="mt-1 h-4 truncate text-[11px] leading-4 text-[#c9a9d1]">{hint}</p>
    </div>
  );
}
