// Shimmer placeholder for loading states. Size it with className
// (e.g. "h-4 w-24"); the shimmer + reduced-motion handling live in globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`fpl-skeleton ${className}`} aria-hidden="true" />;
}

// Generic bordered-table placeholder: a header strip plus `rows` body rows,
// each with `columns` evenly-spread cells. Used by the table-shaped pages
// (outlook, differentials, league standings) while their first fetch lands.
export function TableSkeleton({ columns, rows = 10 }: { columns: number; rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-sm" aria-hidden="true">
      <div className="flex gap-4 bg-surface-sunken px-3 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-t border-border px-3 py-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
