import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

type AppPageSkeletonVariant =
  "dashboard" | "portfolio" | "form" | "analyses" | "settings";

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
      {variant !== "dashboard" && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-5 w-28" />
        </div>
      )}
      {variant === "portfolio" && <PortfolioSkeleton />}
      {variant === "dashboard" && <DashboardSkeleton />}
      {variant === "form" && <FormSkeleton />}
      {variant === "analyses" && <AnalysesSkeleton />}
      {variant === "settings" && <SettingsSkeleton />}
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
      <div className="space-y-5">
        <div className="rounded-xl border bg-card p-5 sm:p-7">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-10 w-56" />
          <Skeleton className="mt-3 h-4 w-64" />
          <div className="mt-6 flex gap-5 border-t pt-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-5 h-4 w-full max-w-xl" />
          <Skeleton className="mt-3 h-2.5 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl" />
          <Skeleton className="mt-4 h-10 w-36" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PanelSkeleton compact />
          <PanelSkeleton compact />
        </div>
      </div>
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-2">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>
      <div className="space-y-4 rounded-lg border p-4">
        <Skeleton className="h-5 w-56" />
        <div className="grid gap-3 sm:grid-cols-3">
          <PanelSkeleton compact />
          <PanelSkeleton compact />
          <PanelSkeleton compact />
        </div>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    </div>
  );
}

function AnalysesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex w-full gap-2 sm:w-fit">
        <Skeleton className="h-11 flex-1 sm:w-44" />
        <Skeleton className="h-11 flex-1 sm:w-44" />
      </div>
      <PanelSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <PanelSkeleton compact />
        <PanelSkeleton compact />
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1].map((item) => (
        <div key={item} className="rounded-xl border bg-card p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="space-y-2">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((metric) => (
              <div key={metric} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
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
