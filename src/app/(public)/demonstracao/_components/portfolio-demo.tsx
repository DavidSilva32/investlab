"use client";

import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleHelp,
  Target,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { Cell, Pie, PieChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStrategyAssetClassColor } from "@/lib/strategy-allocation";

const allocation = [
  {
    id: "fixed_income",
    label: "Renda fixa",
    value: 18400,
    percentage: 40,
    color: getStrategyAssetClassColor("fixed_income"),
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    value: 13800,
    percentage: 30,
    color: getStrategyAssetClassColor("international_etfs"),
  },
  {
    id: "fiis",
    label: "Fundos imobiliários (FIIs)",
    value: 9200,
    percentage: 20,
    color: getStrategyAssetClassColor("fiis"),
  },
  {
    id: "unassigned",
    label: "Sem destino",
    value: 4600,
    percentage: 10,
    color: "var(--destination-unassigned)",
  },
];

const positions = [
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

const objectives = [
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

const strategyTargets = [
  { id: "fixed_income", label: "Renda fixa", target: 35 },
  { id: "brazilian_equities", label: "Ações e BDRs", target: 25 },
  { id: "international_etfs", label: "ETFs internacionais", target: 25 },
  { id: "fiis", label: "Fundos imobiliários (FIIs)", target: 15 },
] as const;

const allocationConfig: ChartConfig = {
  fixed_income: {
    label: "Renda fixa",
    color: getStrategyAssetClassColor("fixed_income"),
  },
  international_etfs: {
    label: "ETFs internacionais",
    color: getStrategyAssetClassColor("international_etfs"),
  },
  fiis: {
    label: "Fundos imobiliários (FIIs)",
    color: getStrategyAssetClassColor("fiis"),
  },
  unassigned: { label: "Sem destino", color: "var(--destination-unassigned)" },
};

const strategyConfig: ChartConfig = {
  fixed_income: {
    label: "Renda fixa",
    color: getStrategyAssetClassColor("fixed_income"),
  },
  brazilian_equities: {
    label: "Ações e BDRs",
    color: getStrategyAssetClassColor("brazilian_equities"),
  },
  international_etfs: {
    label: "ETFs internacionais",
    color: getStrategyAssetClassColor("international_etfs"),
  },
  fiis: {
    label: "Fundos imobiliários (FIIs)",
    color: getStrategyAssetClassColor("fiis"),
  },
};

export function formatSampleCurrency(value: unknown) {
  return "R$ " + Number(value).toLocaleString("pt-BR");
}

export function formatSamplePercentage(value: unknown) {
  return Number(value) + "%";
}

function AllocationPanel() {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição conhecida</CardTitle>
          <p className="text-sm text-muted-foreground">
            O valor conhecido da carteira ilustrativa é R$ 46.000,00.
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={allocationConfig}
            className="mx-auto h-52 max-w-64"
            role="img"
            aria-label="Composição fictícia da carteira: renda fixa 40%, ETFs internacionais 30%, fundos imobiliários 20% e sem destino 10%"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent formatter={formatSampleCurrency} />
                }
              />
              <Pie
                data={allocation}
                dataKey="value"
                nameKey="label"
                innerRadius={54}
                outerRadius={78}
                strokeWidth={3}
                isAnimationActive={false}
              >
                {allocation.map((item) => (
                  <Cell key={item.id} fill={item.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="mt-2 space-y-3">
            {allocation.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {item.percentage}%
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posições de exemplo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Veja como valores, classes e instituições aparecem juntos.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {positions.map((position) => (
              <li
                key={position.name}
                className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium text-foreground">{position.name}</p>
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
    </div>
  );
}

function ObjectivesPanel() {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Target aria-hidden="true" className="size-5" />
          </span>
          <CardTitle className="pt-2 text-lg">
            Seus objetivos no mesmo contexto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p>
            Acompanhe o valor associado a cada objetivo e mantenha visível o que
            você está planejando.
          </p>
          <p>
            O progresso mostra apenas os valores deste exemplo. Não representa
            prazo, rentabilidade ou sugestão de aporte.
          </p>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {objectives.map((objective) => (
          <Card key={objective.name}>
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {objective.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Valor atual do exemplo
                  </p>
                </div>
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground">
                  {objective.progress}% do valor-alvo fictício
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between gap-3 text-sm">
                <span className="text-xl font-semibold tabular-nums text-foreground">
                  {objective.current}
                </span>
                <span className="text-muted-foreground">
                  de {objective.target}
                </span>
              </div>
              <Progress
                aria-label={"Progresso fictício de " + objective.name}
                value={objective.progress}
                className="mt-3"
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StrategyPanel() {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <ChartNoAxesCombined aria-hidden="true" className="size-5" />
          </span>
          <CardTitle className="pt-2 text-lg">
            Uma estratégia definida por você
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            O InvestLab organiza a distribuição que a pessoa registra e coloca a
            carteira atual ao lado dela para dar contexto à comparação.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Demonstração
            </p>
            <p className="mt-1 font-semibold text-foreground">
              Percentuais fictícios escolhidos pela pessoa
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Este cenário não é uma sugestão nem um modelo de carteira.
            </p>
          </div>
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link href="/entrar">
              Conhecer o acesso à plataforma <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Distribuição ilustrativa da estratégia
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Um exemplo de como percentuais por classe podem ser apresentados.
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={strategyConfig}
            className="mx-auto h-56 max-w-64"
            role="img"
            aria-label="Estratégia fictícia definida pela pessoa: renda fixa 35%, ações e BDRs 25%, ETFs internacionais 25%, fundos imobiliários 15%"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent formatter={formatSamplePercentage} />
                }
              />
              <Pie
                data={[...strategyTargets]}
                dataKey="target"
                nameKey="label"
                innerRadius={54}
                outerRadius={78}
                strokeWidth={3}
                isAnimationActive={false}
              >
                {strategyTargets.map((item) => (
                  <Cell
                    key={item.id}
                    fill={getStrategyAssetClassColor(item.id)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="mt-2 space-y-3">
            {strategyTargets.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: getStrategyAssetClassColor(item.id),
                  }}
                />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {item.label}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {item.target}%
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

export function PortfolioDemo() {
  return (
    <div className="mt-7">
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <p className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <CircleHelp
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-primary"
          />
          <span>
            <strong>Este cenário é totalmente fictício.</strong> Os valores,
            percentuais, nomes e instituições servem apenas para apresentar a
            interface. Nada aqui consulta ou altera uma conta real.
          </span>
        </p>
      </div>

      <Tabs defaultValue="posicoes" className="w-full">
        <TabsList
          aria-label="Áreas da demonstração"
          className="grid h-auto w-full grid-cols-3 rounded-xl p-1 sm:max-w-xl"
        >
          <TabsTrigger value="posicoes" className="min-h-11 gap-2 px-2">
            <WalletCards
              aria-hidden="true"
              className="hidden size-4 sm:block"
            />
            Posições
          </TabsTrigger>
          <TabsTrigger value="objetivos" className="min-h-11 gap-2 px-2">
            <Target aria-hidden="true" className="hidden size-4 sm:block" />
            Objetivos
          </TabsTrigger>
          <TabsTrigger value="estrategia" className="min-h-11 gap-2 px-2">
            <ChartNoAxesCombined
              aria-hidden="true"
              className="hidden size-4 sm:block"
            />
            Estratégia
          </TabsTrigger>
        </TabsList>
        <TabsContent value="posicoes" className="mt-5">
          <AllocationPanel />
        </TabsContent>
        <TabsContent value="objetivos" className="mt-5">
          <ObjectivesPanel />
        </TabsContent>
        <TabsContent value="estrategia" className="mt-5">
          <StrategyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
