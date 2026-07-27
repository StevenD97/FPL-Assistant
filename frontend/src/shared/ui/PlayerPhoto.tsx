"use client";

import { useState } from "react";
import { initials } from "@/shared/lib/team";

// Official PL photo CDN doesn't have a shot for every player (see
// player_photo_url's docstring in analysis.py - roughly a third of
// players, mostly younger/lesser-known ones, have no photo at either
// served size). A plain onError-hides-the-<img> handler leaves an empty
// gap where the photo should be, which reads as broken rather than
// "no photo yet" - this renders an initials avatar instead, the same
// treatment the sidebar already uses for a connected manager with no
// team crest to show. Tracks its own load-failure state so a 404 (not
// just a missing/empty src) falls back too.
export function PlayerPhoto({
  src,
  name,
  className,
  style,
}: {
  src?: string;
  name: string;
  className: string;
  style?: React.CSSProperties;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={`flex items-center justify-center font-mono font-semibold text-pl-purple ${className}`}
        style={style}
      >
        {initials(name)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} onError={() => setErrored(true)} className={className} style={style} />
  );
}
