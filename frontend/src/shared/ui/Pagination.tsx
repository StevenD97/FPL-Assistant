// Windowed page numbers: always the first and last page, the current page
// with a neighbour either side, and "…" gaps for the stretches in between -
// so a 25-page list stays a single tidy row instead of 25 buttons.
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  const push = (n: number) => out.push(n);
  const first = 1;
  const last = pageCount;
  const from = Math.max(first, page - 1);
  const to = Math.min(last, page + 1);

  push(first);
  if (from > first + 1) out.push("gap");
  for (let n = Math.max(first + 1, from); n <= Math.min(last - 1, to); n++) push(n);
  if (to < last - 1) out.push("gap");
  if (last > first) push(last);
  return out;
}

function PageButton({
  children,
  active = false,
  disabled = false,
  onClick,
  label,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`min-w-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-brand bg-ink-900 text-white"
          : "border-border bg-surface text-text-secondary hover:border-brand/40 hover:text-brand"
      }`}
    >
      {children}
    </button>
  );
}

// Numbered pagination with Prev/Next. Renders nothing for a single page.
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      <PageButton disabled={page <= 1} onClick={() => onChange(page - 1)} label="Previous page">
        ←
      </PageButton>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-text-muted">
            …
          </span>
        ) : (
          <PageButton key={p} active={p === page} onClick={() => onChange(p)} label={`Page ${p}`}>
            {p}
          </PageButton>
        ),
      )}
      <PageButton disabled={page >= pageCount} onClick={() => onChange(page + 1)} label="Next page">
        →
      </PageButton>
    </nav>
  );
}
