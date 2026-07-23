import { teamColorVar } from "@/lib/teamColors";

type Position = "GKP" | "DEF" | "MID" | "FWD";

export type PitchPlayer = {
  id: number;
  name: string;
  position: Position;
  teamShort: string;
};

const ROWS: Record<Position, number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };

export function PitchFormation({ players }: { players: PitchPlayer[] }) {
  const byRow: Record<number, PitchPlayer[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const p of players) byRow[ROWS[p.position]].push(p);

  return (
    <div
      className="relative flex min-h-[420px] flex-col justify-between gap-6 overflow-hidden rounded-lg px-6 py-8"
      style={{ background: "linear-gradient(180deg, var(--pitch-green-1), var(--pitch-green-2))" }}
    >
      <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-white/25" />
      <div className="pointer-events-none absolute left-4 right-4 top-1/2 border-t-2 border-white/25" />
      {[3, 2, 1, 0].map((row) => (
        <div key={row} className="z-[1] flex justify-center gap-6 flex-wrap">
          {byRow[row].map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] bg-white font-mono text-[11px] font-semibold text-pl-purple shadow-md"
                style={{ borderColor: teamColorVar(p.teamShort) }}
              >
                {p.position}
              </div>
              <span className="whitespace-nowrap rounded-sm bg-white/[0.92] px-2 py-0.5 text-[11px] font-medium text-text-primary">
                {p.name}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
