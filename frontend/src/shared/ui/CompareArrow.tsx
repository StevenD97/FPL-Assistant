// Green up / red down arrow comparing a value against a baseline (the
// primary player being viewed) - assumes higher is better, true for
// every stat this is used with (points, goals, assists, ICT, xGI, etc).
export function CompareArrow({ value, baseline }: { value: number; baseline: number }) {
  if (value === baseline) return <span className="text-text-muted">·</span>;
  const up = value > baseline;
  return (
    <span className={up ? "text-success" : "text-danger"}>
      {up ? "▲" : "▼"}
    </span>
  );
}
