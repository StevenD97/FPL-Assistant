"use client";

/**
 * A club badge that hides itself if the CDN 404s.
 *
 * Its own component purely so the pages using it can stay Server Components -
 * the onError handler is the only thing on the teams grid that needs the
 * client.
 */
export function ClubCrest({ src, className = "h-10 w-10" }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`${className} object-contain`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}
