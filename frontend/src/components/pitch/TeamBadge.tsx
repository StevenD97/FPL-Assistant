import { teamColorVar } from "@/lib/teamColors";

export function TeamBadge({ teamShort, name }: { teamShort: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border border-black/15"
        style={{ background: teamColorVar(teamShort) }}
      />
      {name}
    </span>
  );
}
