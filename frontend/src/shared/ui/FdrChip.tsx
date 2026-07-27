"use client";

// FPL's own fixture-difficulty color convention: green = easy, red = hard.
const DIFFICULTY_CLASSES: Record<number, string> = {
  1: "bg-success text-white",
  2: "bg-success-bg text-success",
  3: "bg-slate-100 text-text-secondary",
  4: "bg-danger-bg text-danger",
  5: "bg-danger text-white",
};

export function FdrChip({
  opponent,
  isHome,
  difficulty,
  badgeUrl,
}: {
  opponent: string;
  isHome: boolean;
  difficulty: number;
  badgeUrl?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
        DIFFICULTY_CLASSES[difficulty] ?? "bg-slate-100 text-text-secondary"
      }`}
    >
      {badgeUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badgeUrl}
          alt=""
          className="h-3.5 w-3.5 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      {opponent}
      {isHome ? "(H)" : "(A)"}
    </span>
  );
}
