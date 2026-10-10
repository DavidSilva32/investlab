import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetLogo } from "@/components/asset-logo";

export function AnalysisSkeleton({ ticker }: { ticker?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Carregando análise...</span>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-3">
            <AssetLogo ticker={ticker} size="lg" />
            <Skeleton className="h-8 w-56 max-w-full" />
          </div>
        </CardHeader>
        <CardContent className="flex gap-6">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-6 w-28" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full sm:h-56" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-60 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-4 h-7 w-28" />
              <Skeleton className="mt-3 h-3 w-36 max-w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-lg border p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-44 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
