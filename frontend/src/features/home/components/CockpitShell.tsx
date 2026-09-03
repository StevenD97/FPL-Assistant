import Link from "next/link";
import { Countdown, DeadlineLabel } from "@/shared/ui/Countdown";
import { InfoTooltip } from "@/shared/ui/InfoTooltip";
import type { StatGlossaryKey } from "@/shared/lib/statGlossary";

/**
 * The header bar for a connected manager's dashboard.
 *
 * This used to be a hero: a coloured block eleven hundred pixels tall on
 * desktop and two fifths of the home page on a phone, wrapping the stats, the
 * pitch and five panels inside itself. Everything in it was therefore a
 * translucent white card on a coloured ground - the least legible container
 * treatment available - and every reader was three levels deep before reaching
 * a number.
 *
 * It is a bar now. One row: which gameweek, whose team, when the deadline is,
 * and the single thing to do about it. Everything the hero used to contain is
 * a sibling below it, on the page's own ground, in ordinary surfaces. The
 * content did not shrink; it stopped being nested inside a decoration.
 *
 * `headline` is the week's one recommendation, in a sentence. It is the reason
 * the bar exists rather than being a title - if there is nothing to say, the
 * bar is just a heading and a countdown, which is fine.
 */
export function CockpitShell({
  eyebrow,
  title,
  subtitle,
  headline,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  /** This week's single recommendation, stated plainly. */
  headline?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="rounded-lg border border-border bg-surface px-4 py-3.5 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {/* A manager's team name is theirs, and seeing it cut to "Ready when
              you are, St…" reads as a bug in the first two seconds. It wraps
              rather than truncating. */}
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">
              {eyebrow}
            </span>
            <h1 className="mt-0.5 text-balance break-words text-lg font-bold leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
          </div>

          <Link
            href="/squad"
            className="tap-target flex shrink-0 items-baseline gap-2 text-right"
          >
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-text-muted">
              Deadline
            </span>
            <Countdown className="font-mono text-md font-bold text-text-primary" />
            <span className="text-xs text-text-muted">
              <DeadlineLabel />
            </span>
          </Link>
        </div>

        {headline && (
          <p className="mt-2.5 border-t border-border pt-2.5 text-sm leading-relaxed text-text-secondary">
            {headline}
          </p>
        )}
      </div>

      {children}
    </>
  );
}

/**
 * One of the dashboard's headline numbers.
 *
 * On the page's own surface now rather than translucent white on a colour, so
 * the value is the highest-contrast thing in the tile instead of competing
 * with the ground behind it.
 */
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
    <div className="flex flex-col rounded-lg border border-border bg-surface px-3.5 py-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.1em] text-text-muted">
        {label}
        {tooltip && <InfoTooltip term={tooltip} />}
      </p>
      {/* Every value renders in the same fixed-height box, so the four read as
          one row of numbers rather than drifting off each other's baseline
          when one holds a name instead of a figure. A long name steps down a
          size rather than being cut. */}
      <p
        className={`mt-1 flex h-6 items-center truncate font-mono font-extrabold leading-none text-text-primary ${
          typeof value === "string" && value.length > 9 ? "text-base" : "text-xl"
        }`}
      >
        {value}
      </p>
      {/* Reserved whether or not there's a hint, so tiles with one don't sit
          taller than the rest. */}
      <p className="mt-1 h-4 truncate text-xs leading-4 text-text-muted">{hint}</p>
    </div>
  );
}
