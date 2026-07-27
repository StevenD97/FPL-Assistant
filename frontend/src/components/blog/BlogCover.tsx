"use client";

import { NavIcon } from "@/components/nav/icons";
import type { BlogCover as BlogCoverData } from "@/lib/blog";

const PL_RESOURCES_BASE = "https://resources.premierleague.com/premierleague";

function playerPhotoUrl(code: number): string {
  return `${PL_RESOURCES_BASE}/photos/players/250x250/p${code}.png`;
}

function teamBadgeUrl(code: number): string {
  return `${PL_RESOURCES_BASE}/badges/250/t${code}.png`;
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.display = "none";
}

// Cover art for a blog post/card, built from the same official CDN assets
// used across the rest of the app (badges, player photos) - not stock
// photography, which this app has no rights to. Falls back to a plain
// gradient banner (still on-brand, just no external image) when a post
// has no natural single team/player to headline, or if the CDN image
// itself 404s (hideOnError).
export function BlogCover({ cover, size = "card" }: { cover: BlogCoverData; size?: "card" | "hero" }) {
  const bgClass = cover.background === "pitch" ? "bg-fpl-pitch" : "bg-fpl-hero";
  const heightClass = size === "hero" ? "h-48 lg:h-64" : "h-32";

  return (
    <div className={`relative flex items-end justify-center overflow-hidden rounded-lg ${bgClass} ${heightClass}`}>
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(0,255,135,0.28),transparent_70%)]" />

      {cover.type === "player" && (
        <div className="relative flex items-end gap-2 pt-4">
          {cover.players.slice(0, 3).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.code}
              src={playerPhotoUrl(p.code)}
              alt={p.name}
              onError={hideOnError}
              className={`${size === "hero" ? "h-44 lg:h-60" : "h-28"} w-auto object-contain drop-shadow-lg`}
            />
          ))}
        </div>
      )}

      {cover.type === "badges" && (
        <div className="relative mb-4 flex items-center gap-4">
          {cover.teamCodes.slice(0, 4).map((code) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={code}
              src={teamBadgeUrl(code)}
              alt=""
              onError={hideOnError}
              className={`${size === "hero" ? "h-16 w-16 lg:h-20 lg:w-20" : "h-10 w-10"} object-contain drop-shadow-lg`}
            />
          ))}
        </div>
      )}

      {cover.type === "gradient" && (
        <NavIcon
          name="blog"
          className={`relative mb-3 text-white/25 ${size === "hero" ? "h-16 w-16" : "h-10 w-10"}`}
        />
      )}
    </div>
  );
}
