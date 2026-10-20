import Link from "next/link";
import { ArrowLeft, ArrowRight, ChartNoAxesCombined } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PortfolioDemo } from "./_components/portfolio-demo";

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        href="/apresentacao"
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar à landing page
      </Link>

      <div className="mt-7 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <ChartNoAxesCombined aria-hidden="true" className="size-4" />
            Explore o InvestLab
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Sua carteira, objetivos e estratégia em contexto.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            Navegue por uma experiência guiada e veja como diferentes áreas do
            produto se conectam para ajudar você a acompanhar seu patrimônio.
          </p>
        </div>
        <Button asChild className="min-h-11 shrink-0">
          <Link href="/entrar">
            Acessar a plataforma <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <PortfolioDemo />
    </main>
  );
}
