"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Target,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const allocation = [
  { label: "Renda fixa", percent: "40%", color: "bg-asset-class-fixed-income" },
  {
    label: "ETFs internacionais",
    percent: "30%",
    color: "bg-asset-class-international-etfs",
  },
  {
    label: "Fundos imobiliários (FIIs)",
    percent: "20%",
    color: "bg-asset-class-fiis",
  },
  { label: "Sem destino", percent: "10%", color: "bg-destination-unassigned" },
];

function PositionsContent() {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader className="pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Valor conhecido neste exemplo
          </p>
          <CardTitle className="text-2xl sm:text-3xl">R$ 46.000,00</CardTitle>
          <p className="text-xs text-muted-foreground">
            Distribuição fictícia por destino
          </p>
        </CardHeader>
        <CardContent>
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
            <span className="bg-asset-class-fiis" style={{ width: "20%" }} />
            <span
              className="bg-destination-unassigned"
              style={{ width: "10%" }}
            />
          </div>
          <ul aria-label="Distribuição fictícia" className="mt-4 space-y-3">
            {allocation.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`size-2.5 shrink-0 rounded-full ${item.color}`}
                />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {item.percent}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["CDB de exemplo", "Renda fixa · Banco Aurora"],
          ["ETF de exemplo", "ETFs internacionais · Corretora Horizonte"],
          [
            "Fundo imobiliário de exemplo",
            "Fundos imobiliários · Corretora Horizonte",
          ],
          ["Saldo de exemplo", "Sem destino · Banco Aurora"],
        ].map(([name, metadata]) => (
          <Card
            key={name}
            className="transition-colors hover:border-primary/30"
          >
            <CardContent className="flex h-full flex-col justify-between gap-5 p-4">
              <WalletCards aria-hidden="true" className="size-5 text-primary" />
              <div>
                <p className="font-semibold text-foreground">{name}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {metadata}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ObjectivesContent() {
  const goals = [
    {
      name: "Reserva de exemplo",
      current: "R$ 12.600,00",
      target: "R$ 18.000,00",
      progress: 70,
    },
    {
      name: "Objetivo pessoal de exemplo",
      current: "R$ 7.500,00",
      target: "R$ 15.000,00",
      progress: 50,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {goals.map((goal) => (
        <Card key={goal.name}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Target aria-hidden="true" className="size-4 text-primary" />
                {goal.name}
              </div>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {goal.progress}%
              </span>
            </div>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
              <p className="text-xl font-semibold text-foreground">
                {goal.current}
              </p>
              <p className="text-sm text-muted-foreground">de {goal.target}</p>
            </div>
            <Progress
              value={goal.progress}
              aria-label={`${goal.name}: ${goal.progress}% do valor-alvo`}
              className="mt-3"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Parte do valor-alvo registrada no exemplo.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StrategyContent() {
  const strategy = [
    ["Renda fixa", "35%", "bg-asset-class-fixed-income"],
    ["Ações e BDRs", "25%", "bg-asset-class-brazilian-equities"],
    ["ETFs internacionais", "25%", "bg-asset-class-international-etfs"],
    ["Fundos imobiliários (FIIs)", "15%", "bg-asset-class-fiis"],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="bg-primary/[0.04]">
        <CardContent className="p-5">
          <ChartNoAxesCombined
            aria-hidden="true"
            className="size-6 text-primary"
          />
          <h3 className="mt-4 font-semibold text-foreground">
            Uma referência escolhida por você
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            O exemplo mostra percentuais registrados para comparar com a
            carteira. Não é uma sugestão de investimento.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          {strategy.map(([label, percent, color]) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-full ${color}`}
              />
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {percent}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function LandingProductPreview() {
  return (
    <Card className="mx-auto max-w-5xl overflow-hidden border-border shadow-xl shadow-primary/5">
      <Tabs defaultValue="positions" className="w-full">
        <div className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold text-foreground">
              Uma prévia do InvestLab
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma área para ver o que ela ajuda a organizar
            </p>
          </div>
          <TabsList
            aria-label="Áreas da prévia"
            className="grid h-10 w-full grid-cols-3 sm:w-auto"
          >
            <TabsTrigger value="positions">Posições</TabsTrigger>
            <TabsTrigger value="objectives">Objetivos</TabsTrigger>
            <TabsTrigger value="strategy">Estratégia</TabsTrigger>
          </TabsList>
        </div>
        <CardContent className="p-4 sm:p-6">
          <TabsContent value="positions" className="mt-0 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Veja o que compõe sua carteira
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Valores conhecidos e posições de exemplo, organizados no mesmo
                lugar.
              </p>
            </div>
            <PositionsContent />
          </TabsContent>
          <TabsContent value="objectives" className="mt-0 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Veja o que você está construindo
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhe os valores que você associou a cada objetivo.
              </p>
            </div>
            <ObjectivesContent />
          </TabsContent>
          <TabsContent value="strategy" className="mt-0 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Compare com a estratégia que você definiu
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A composição é sua; o InvestLab mostra os percentuais
                registrados, sem sugerir uma carteira.
              </p>
            </div>
            <StrategyContent />
          </TabsContent>
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-muted-foreground">
              Dados, pessoas, instituições e percentuais são fictícios. Não são
              recomendação nem previsão de resultado.
            </p>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/demonstracao">
                Abrir demonstração <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Tabs>
    </Card>
  );
}
