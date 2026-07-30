import type { ReactNode, ThHTMLAttributes } from "react";

/**
 * The wrapper + <table> every table on the site was repeating by hand, plus
 * opt-in mobile behaviour.
 *
 * `cards` (default true) adds the `table-cards` class from globals.css: below
 * 768px each row collapses into a stacked label:value card instead of scrolling
 * sideways. That requires two things from the cells, which the CSS can't infer:
 *   - every non-lead <td> needs `data-label="..."` (used as the synthesized
 *     header via ::before)
 *   - the lead <td> needs `className="cell-primary"` (becomes the row heading)
 * Pass `cards={false}` for genuine matrices, where collapsing a row into
 * label:value pairs loses the grid that makes it readable (see PlannerTable).
 */
export function TableFrame({
  cards = true,
  children,
  className = "",
  tableClassName = "",
}: {
  cards?: boolean;
  children: ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-border shadow-sm ${className}`}>
      <table className={`${cards ? "table-cards " : ""}w-full text-left text-sm ${tableClassName}`}>
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
