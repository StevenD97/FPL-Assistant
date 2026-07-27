// Shimmer placeholder for loading states. Size it with className
// (e.g. "h-4 w-24"); the shimmer + reduced-motion handling live in globals.css.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`fpl-skeleton ${className}`} aria-hidden="true" />;
}
