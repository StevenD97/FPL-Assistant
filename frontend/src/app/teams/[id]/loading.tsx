import { PageContainer } from "@/shared/layout/PageContainer";
import { Skeleton } from "@/shared/ui/Skeleton";

// Mirrors the loaded shape: badge + name up top, then a grid of leaderboard
// cards - so the page's shape is stable before the data lands.
export default function Loading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-20" />
      <div className="mb-2 flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
