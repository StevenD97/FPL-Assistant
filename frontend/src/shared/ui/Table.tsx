import type { ReactNode, ThHTMLAttributes } from "react";

/** How a table should cope with a phone-width screen. */
export type TableMobileMode = "cards" | "dense" | "scroll";

const MOBILE_CLASS: Record<TableMobileMode, string> = {
  cards: "table-cards ",
  dense: "table-dense ",
  scroll: "",
};

/**
 * The wrapper + <table> every table on the site was repeating by hand, plus
 * mobile behaviour.
 *
 * `mobile` picks how the table survives a narrow screen. Which one is right
 * depends on the question the table answers:
 *
 * - `"cards"` (default) - one row at a time. Below 768px each row collapses into
 *   a stacked label:value card. Best when rows are read individually and there
 *   are several low-priority columns. Needs two things from the cells that the
 *   CSS can't infer: every non-lead <td> needs `data-label="..."` (synthesized
 *   into a header via ::before), and the lead <td> needs `cell-primary` (it
 *   becomes the row heading).
 * - `"dense"` - the whole grid, smaller. Keeps every column on screen and steps
 *   the type and padding down one rung. Best for a *matrix*, where the reader is
 *   comparing rows by scanning down a column - collapsing that into cards
 *   destroys the comparison, and scrolling hides half of it.
 * - `"scroll"` - no adaptation; the wrapper scrolls sideways. Only for tables
 *   genuinely too wide to shrink.
 */
export function TableFrame({
  mobile = "cards",
  children,
  className = "",
  tableClassName = "",
}: {
  mobile?: TableMobileMode;
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border shadow-sm ${className}`}>
      <table className={`${MOBILE_CLASS[mobile]}w-full text-left text-sm ${tableClassName}`}>
        {children}
      </table>
    </div>
  );
}

/** Header cell with the shared uppercase-muted styling. */
export function Th({
  children,
  className = "",
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      {...rest}
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted ${className}`}
    >
      {children}
    </th>
  );
}
