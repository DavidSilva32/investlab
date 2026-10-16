import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function StrategyLoading() {
  return (
    <AppShell title="Estratégia">
      <section
        role="status"
        aria-label="Carregando as posições de Longo Prazo e os valores atuais…"
        aria-busy="true"
        className="space-y-5"
      >
        <p className="sr-only">
          Carregando as posições de Longo Prazo e os valores atuais…
        </p>
        <div className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
          <div className="flex items-center gap-4">
            <Skeleton className="hidden size-14 rounded-xl sm:block" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-10 w-56 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
          </div>
          <div className="space-y-2 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-60 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
          <Skeleton className="h-10 w-full sm:w-48" />
        </div>
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-6 h-36 w-full sm:h-44 lg:h-48" />
          <div className="mt-4 flex flex-wrap gap-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-28" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-2 h-4 w-56 max-w-full" />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Skeleton className="h-10 w-full sm:max-w-xs" />
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
          <div className="mt-4 space-y-3 rounded-lg border p-4">
            <Skeleton className="h-5 w-52" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
