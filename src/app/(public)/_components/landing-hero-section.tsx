import Link from "next/link";
import { ArrowRight, Compass, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LandingHeroSection() {
  return (
    <section className="relative isolate border-b border-border bg-gradient-to-b from-primary/[0.07] via-background to-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-44 -top-44 -z-10 size-[34rem] rounded-full bg-primary/15 blur-3xl motion-safe:animate-pulse"
      />
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-2 text-sm font-semibold text-primary">
            <Compass aria-hidden="true" className="size-4" />
            Sua vida financeira em perspectiva
          </p>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Entenda o que você tem.{" "}
            <span className="text-primary">Cuide do que importa.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Organize seus investimentos, acompanhe seus objetivos e veja como a
            estratégia que você escolheu aparece na carteira — em uma visão mais
            fácil de entender.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="group min-h-12 shadow-lg shadow-primary/20"
            >
              <Link href="/demonstracao">
                Explorar a demonstração
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-12">
              <Link href="#produto">Ver por dentro</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Sem cadastro para conhecer. A demonstração usa um cenário fictício.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Já tem acesso?{" "}
            <Link
              href="/entrar"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Entre na sua conta
            </Link>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <Link
              href="/cadastro"
              className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Criar conta beta
            </Link>
          </p>
          <ul
            aria-label="O que você verá"
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"
          >
            {[
              "Carteira e posições",
              "Objetivos pessoais",
              "Estratégia definida por você",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-primary"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="landing-hero-scene relative mx-auto w-full max-w-2xl">
          <div
            aria-hidden="true"
            className="landing-hero-glow absolute -inset-4 -z-10 rounded-[2rem] bg-primary/10 blur-2xl"
          />
          <div aria-hidden="true" className="landing-hero-depth-card" />
          <Card
            role="region"
            aria-label="Prévia fictícia da carteira no InvestLab"
            className="landing-hero-card relative overflow-hidden rounded-2xl border-border/80 bg-card shadow-2xl shadow-primary/10"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <WalletCards aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">
                    Carteira de exemplo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Prévia do produto
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Cenário fictício
              </span>
            </div>
            <CardContent className="p-5 sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Valor conhecido no exemplo
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    R$ 46.000,00
                  </p>
                </div>
                <span className="rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-muted-foreground">
                  4 destinos
                </span>
              </div>
              <div className="mt-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    Distribuição da carteira
                  </h2>
                  <span className="text-xs text-muted-foreground">Exemplo</span>
                </div>
                <div
                  aria-hidden="true"
                  className="flex h-3 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="bg-asset-class-fixed-income"
                    style={{ width: "40%" }}
                  />
                  <span
                    className="bg-asset-class-international-etfs"
                    style={{ width: "30%" }}
                  />
                  <span
                    className="bg-asset-class-fiis"
                    style={{ width: "20%" }}
                  />
                  <span
                    className="bg-destination-unassigned"
                    style={{ width: "10%" }}
                  />
                </div>
                <ul
                  aria-label="Distribuição fictícia"
                  className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
                >
                  {[
                    ["Renda fixa", "40%", "bg-asset-class-fixed-income"],
                    [
                      "ETFs internacionais",
                      "30%",
                      "bg-asset-class-international-etfs",
                    ],
                    [
                      "Fundos imobiliários (FIIs)",
                      "20%",
                      "bg-asset-class-fiis",
                    ],
                    ["Sem destino", "10%", "bg-destination-unassigned"],
                  ].map(([label, share, color]) => (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden="true"
                        className={`size-2.5 shrink-0 rounded-full ${color}`}
                      />
                      <span className="min-w-0 flex-1 text-muted-foreground">
                        {label}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">
                        {share}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">
                    Objetivos acompanhados
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    2 objetivos
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="text-sm text-muted-foreground">Estratégia</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    Escolhida por você
                  </p>
                </div>
              </div>
              <p className="mt-5 text-xs leading-5 text-muted-foreground">
                Valores e percentuais fictícios. Não são recomendação nem
                previsão de resultado.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
