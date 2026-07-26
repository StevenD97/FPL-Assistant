import { teamColorVar } from "@/lib/teamColors";

// badgeUrl (official PL CDN, see backend's team_badge_url) renders the real
// crest; omit it to fall back to the original colored-dot indicator, which
// most callers still use since they don't have image data threaded through.
export function TeamBadge({ teamShort, name, badgeUrl }: { teamShort: string; name: string; badgeUrl?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {badgeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badgeUrl} alt="" className="h-4 w-4 object-contain" />
      ) : (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full border border-black/15"
          style={{ background: teamColorVar(teamShort) }}
        />
      )}
      {name}
    </span>
  );
}
