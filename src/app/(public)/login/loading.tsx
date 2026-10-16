import { Skeleton } from "@/components/ui/skeleton";
export default function LoginLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-muted/40 p-4"
    >
      <p className="sr-only">Carregando acesso</p>
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-lg shadow-primary/5">
        <div className="grid justify-items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-52" />
        </div>
        <Skeleton className="mt-8 h-10 w-full" />
        <Skeleton className="mt-5 h-10 w-full" />
        <Skeleton className="mt-6 h-10 w-full" />
      </div>
    </main>
  );
}
