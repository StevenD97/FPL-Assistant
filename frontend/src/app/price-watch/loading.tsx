import { PageContainer, PageHeader } from "@/shared/layout/PageContainer";
import { Card } from "@/shared/ui/Card";
import { Skeleton } from "@/shared/ui/Skeleton";

// Two columns (risers / fallers) of mover rows - mirrors the loaded layout.
function PriceWatchSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {["Likely risers", "Likely fallers"].map((title) => (
        <Card key={title} padded={false} className="overflow-hidden">
          <div className="border-b border-border px-3.5 py-3">
            <h2 className="text-md font-semibold text-text-primary">{title}</h2>
          </div>
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-10" />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <PageContainer>
      <PageHeader
        title="Price watch"
        subtitle="Players with the biggest net transfer activity today - a signal for who's at risk of a £0.1m
          price change at tonight's update (~2:30am UK), not a guaranteed prediction."
      />
      <PriceWatchSkeleton />
    </PageContainer>
  );
}
