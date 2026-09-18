import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

type AppPageSkeletonVariant =
  "dashboard" | "portfolio" | "form" | "placeholder";

type AppPageSkeletonProps = {
  title: string;
  variant: AppPageSkeletonVariant;
};

export function AppPageSkeleton({ title, variant }: AppPageSkeletonProps) {
  return (
    <AppShell title={title}>
      <AppContentSkeleton title={title} variant={variant} />
    </AppShell>
  );
}

export function AppContentSkeleton({ title, variant }: AppPageSkeletonProps) {
  return (
    <section aria-busy="true" aria-live="polite" className="space-y-6">
      <p className="sr-only">Carregando {title.toLowerCase()}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-5 w-28" />
      </div>
      {variant === "portfolio" && <PortfolioSkeleton />}
      {variant === "dashboard" && <DashboardSkeleton />}
      {variant === "form" && <FormSkeleton />}
      {variant === "placeholder" && <PlaceholderSkeleton />}
    </section>
  );
}

function PortfolioSkeleton() {
  return (
    <>
      <div className="flex gap-1 border-b pb-px">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-32" />
      </div>
      <MetricSkeletons />
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <PanelSkeleton />
        <PanelSkeleton compact />
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <MetricSkeletons />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <PanelSkeleton />
        <PanelSkeleton compact />
      </div>
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Skeleton className="h-5 w-52" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mt-8 h-36 w-full" />
      <Skeleton className="mt-5 h-10 w-32" />
    </div>
  );
}

function PlaceholderSkeleton() {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border bg-card p-6">
      <div className="grid justify-items-center gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
  );
}

function MetricSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-36" />
          <Skeleton className="mt-4 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className={`mt-8 w-full ${compact ? "h-40" : "h-56"}`} />
    </div>
  );
}
