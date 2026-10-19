import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleHelp, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const samplePositions = [
  {
    name: "CDB de exemplo",
    category: "Renda fixa",
    institution: "Banco Aurora",
    value: "R$ 18.400,00",
    share: "40%",
  },
  {
    name: "ETF de exemplo",
    category: "ETFs internacionais",
    institution: "Corretora Horizonte",
    value: "R$ 13.800,00",
    share: "30%",
  },
  {
    name: "Fundo imobiliário de exemplo",
    category: "Fundos imobiliários (FIIs)",
    institution: "Corretora Horizonte",
    value: "R$ 9.200,00",
    share: "20%",
  },
  {
    name: "Saldo de exemplo",
    category: "Sem destino",
    institution: "Banco Aurora",
    value: "R$ 4.600,00",
    share: "10%",
  },
];

export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar à página inicial
      </Link>

      <div className="mt-7 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <WalletCards aria-hidden="true" className="size-4" />
            Demonstração do InvestLab
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Uma carteira de exemplo
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Explore uma visão ilustrativa de posições e distribuição. Esta tela
            usa apenas conteúdo fictício e não consulta nem altera dados de
            nenhuma conta.
          </p>
        </div>
        <Button asChild className="min-h-11 shrink-0">
          <Link href="/entrar">
            Entrar na plataforma <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <p className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <CircleHelp
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-primary"
          />
          <span>
            <strong>Dados totalmente fictícios.</strong> A demonstração é
            estática e isolada: não usa sessão, API, banco de dados, importação
            de arquivos nem ferramentas de escrita.
          </span>
        </p>
      </div>

      <section
        aria-label="Carteira ilustrativa"
        className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"
      >
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Resumo fictício</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Valor conhecido</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              R$ 46.000,00
            </p>
            <div className="mt-6 space-y-4">
              {[
                ["Renda fixa", 40],
                ["ETFs internacionais", 30],
                ["Fundos imobiliários (FIIs)", 20],
                ["Sem destino", 10],
              ].map(([label, percentage]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {percentage}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Posições ilustrativas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {samplePositions.map((position) => (
                <li
                  key={position.name}
                  className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {position.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {position.category} · {position.institution}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold tabular-nums text-foreground">
                      {position.value}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {position.share} da carteira fictícia
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
