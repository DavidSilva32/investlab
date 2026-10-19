import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ChartNoAxesCombined,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const highlights = [
  {
    icon: WalletCards,
    title: "Uma visão organizada",
    description:
      "Reúna posições, movimentações e instituições em uma carteira fácil de acompanhar.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Decisões com contexto",
    description:
      "Acompanhe a composição da carteira, seus objetivos e os dados que ajudam a planejar.",
  },
  {
    icon: ShieldCheck,
    title: "Acesso à sua conta",
    description:
      "As informações da carteira ficam associadas à conta autenticada que as registrou.",
  },
];

export function LandingPage() {
  return (
    <main>
      <section className="relative isolate overflow-hidden bg-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] w-[min(90vw,76rem)] rounded-full bg-brand/10 blur-3xl"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
              <BarChart3 aria-hidden="true" className="size-4" />
              Sua carteira, com mais clareza
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Organize seus investimentos em um só lugar.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Acompanhe posições, movimentações e objetivos para entender melhor
              como sua carteira está organizada.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12">
                <Link href="/demonstracao">
                  Explorar demonstração
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-12">
                <Link href="/entrar">Entrar na plataforma</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              O acesso à plataforma é disponibilizado por convite.
            </p>
          </div>

          <Card
            aria-label="Prévia ilustrativa de uma carteira"
            className="overflow-hidden border-border/70 bg-card/90 shadow-2xl shadow-brand/10"
          >
            <CardContent className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Visão geral
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    Sua carteira em contexto
                  </p>
                </div>
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Prévia
                </span>
              </div>
              <div className="mt-6 rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Valor conhecido
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      R$ 84.250,00
                    </p>
                  </div>
                  <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <WalletCards aria-hidden="true" className="size-5" />
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-5 flex h-24 items-end gap-2 rounded-lg bg-muted/60 px-3 pb-3 pt-4"
                >
                  {[34, 46, 41, 59, 51, 68, 63, 82, 72, 92, 78, 100].map(
                    (height, index) => (
                      <span
                        key={index}
                        className="flex-1 rounded-t-sm bg-primary/70"
                        style={{ height: `${height}%` }}
                      />
                    ),
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Posições", "12"],
                  ["Objetivos", "3"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-border bg-background p-4"
                  >
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Ilustração com valores fictícios. Não representa uma carteira
                real nem recomendação de investimento.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section
        aria-labelledby="landing-highlights-heading"
        className="border-t border-border bg-muted/30"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">InvestLab</p>
            <h2
              id="landing-highlights-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Acompanhe o que importa para você.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {highlights.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-border/70 bg-card/80">
                <CardContent className="p-5">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div>
              <h3 className="font-semibold text-foreground">
                Quer conhecer a experiência?
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Explore a demonstração sem conectar nem alterar dados de uma
                conta.
              </p>
            </div>
            <Button asChild variant="outline" className="shrink-0">
              <Link href="/demonstracao">
                Ver demonstração <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
