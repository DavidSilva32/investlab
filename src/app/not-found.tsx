import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-background px-4 py-8 sm:px-8 sm:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 -top-56 -z-10 size-[38rem] rounded-full bg-brand/15 blur-3xl sm:size-[48rem]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-64 -right-40 -z-10 size-[34rem] rounded-full bg-brand/10 blur-3xl sm:size-[44rem]"
      />

      <header className="relative flex w-full items-center justify-center">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          Invest<span className="text-brand">Lab</span>
        </p>
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center py-16 sm:py-20">
        <div className="w-full max-w-2xl rounded-3xl border border-brand/35 bg-card/75 px-6 py-10 text-center shadow-2xl shadow-brand/10 backdrop-blur-xl sm:px-12 sm:py-14">
          <p
            aria-hidden="true"
            className="bg-gradient-to-b from-foreground to-brand bg-clip-text text-8xl font-bold leading-none tracking-tight text-transparent drop-shadow-[0_0_24px_color-mix(in_oklab,var(--brand)_35%,transparent)] sm:text-9xl"
          >
            404
          </p>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl">
            Página não encontrada
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            O endereço que você acessou não existe ou foi alterado.
          </p>
          <Button asChild size="lg" className="mt-8 w-full max-w-xs">
            <Link href="/">Voltar ao Dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
