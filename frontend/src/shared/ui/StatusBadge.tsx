const STATUS_LABELS: Record<string, string> = {
  d: "Doubtful",
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
  n: "Not in squad",
};

export function StatusBadge({ status, news }: { status?: string; news?: string }) {
  if (!status || status === "a") return null;
  return (
    <span
      title={news || undefined}
      className="ml-1.5 rounded-sm bg-danger-bg px-1.5 py-0.5 text-xs font-semibold text-danger"
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
