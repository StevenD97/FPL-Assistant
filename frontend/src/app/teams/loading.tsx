import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Skeleton } from "@/shared/ui/Skeleton";

// Same 20-crest grid the page used to render while its client-side fetch was
// in flight; now that the fetch happens on the server, this is what covers it.
export default function Loading() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Research"
        title="Teams"
        subtitle="Every Premier League club - open one for its top 5 in goals, xG, assists, xA, points, minutes, discipline, and more."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 20 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
