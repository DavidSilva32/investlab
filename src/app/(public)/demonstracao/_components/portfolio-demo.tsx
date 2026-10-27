"use client";

import {
  ArrowRight,
  ChartNoAxesCombined,
  CircleHelp,
  RotateCcw,
  Target,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStrategyAssetClassColor } from "@/lib/strategy-allocation";

const allocationOptions = [
  {
    id: "fixed_income",
    label: "Renda fixa",
    positionName: "CDB de exemplo",
    institution: "Banco Aurora",
    color: getStrategyAssetClassColor("fixed_income"),
  },
  {
    id: "international_etfs",
    label: "ETFs internacionais",
    positionName: "ETF de exemplo",
    institution: "Corretora Horizonte",
    color: getStrategyAssetClassColor("international_etfs"),
  },
  {
    id: "fiis",
    label: "Fundos imobiliários (FIIs)",
    positionName: "Fundo imobiliário de exemplo",
    institution: "Corretora Horizonte",
    color: getStrategyAssetClassColor("fiis"),
  },
  {
    id: "unassigned",
    label: "Sem destino",
    positionName: "Saldo de exemplo",
    institution: "Banco Aurora",
    color: "var(--destination-unassigned)",
  },
] as const;

type AllocationId = (typeof allocationOptions)[number]["id"];
type AllocationValues = Record<AllocationId, number>;

const initialAllocationValues: AllocationValues = {
  fixed_income: 18400,
  international_etfs: 13800,
  fiis: 9200,
  unassigned: 4600,
};

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
  return (
    Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
  );
}

export function getSamplePercentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function AllocationPanel({
  values,
  onValueChange,
  onReset,
}: {
  values: AllocationValues;
  onValueChange: (id: AllocationId, value: number) => void;
  onReset: () => void;
}) {
  const total = allocationOptions.reduce(
    (sum, item) => sum + values[item.id],
    0,
  );
  const allocation = allocationOptions.map((item) => ({
    ...item,
    value: values[item.id],
    percentage: getSamplePercentage(values[item.id], total),
  }));
  const positions = allocation.filter((item) => item.value > 0);
  const chartDescription = allocation
    .map((item) => `${item.label} ${formatSamplePercentage(item.percentage)}`)
    .join(", ");

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Composição conhecida</CardTitle>
          <p className="text-sm text-muted-foreground">
            Total do exemplo: {formatSampleCurrency(total)}
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={allocationConfig}
            className="mx-auto h-52 max-w-64"
            role="img"
            aria-label={`Composição fictícia da carteira: ${chartDescription}`}
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
                isAnimationActive
                animationDuration={420}
              >
                {allocation.map((item) => (
                  <Cell key={item.id} fill={item.color} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <ul className="mt-2 space-y-3" aria-label="Composição do exemplo">
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
                  {formatSamplePercentage(item.percentage)}
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
          {positions.length > 0 ? (
            <ul className="divide-y divide-border">
              {positions.map((position) => (
                <li
                  key={position.id}
                  className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {position.positionName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {position.label} · {position.institution}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold tabular-nums text-foreground">
                      {formatSampleCurrency(position.value)}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                      {formatSamplePercentage(position.percentage)} do total
                      fictício
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Ajuste um valor para explorar a composição do exemplo.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="motion-content-reveal xl:col-span-2">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Experimente a composição
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Arraste os controles. O cenário é fictício e não sugere uma
              carteira.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={allocation.every(
              (item) => item.value === initialAllocationValues[item.id],
            )}
            className="min-h-10 shrink-0"
          >
            <RotateCcw aria-hidden="true" />
            Restaurar exemplo
          </Button>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {allocation.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums text-foreground"
                  aria-live="polite"
                >
                  {formatSampleCurrency(item.value)}
                </span>
              </div>
              <Slider
                aria-label={`${item.label} no cenário fictício`}
                aria-valuetext={formatSampleCurrency(item.value)}
                min={0}
                max={50000}
                step={100}
                value={[item.value]}
                onValueChange={([value]) => onValueChange(item.id, value)}
                className="py-2"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>R$ 0</span>
                <span>{formatSamplePercentage(item.percentage)} do total</span>
                <span>R$ 50.000</span>
              </div>
            </div>
          ))}
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
  const [allocationValues, setAllocationValues] = useState<AllocationValues>(
    initialAllocationValues,
  );

  function updateAllocation(id: AllocationId, value: number) {
    setAllocationValues((current) => ({ ...current, [id]: value }));
  }

  function resetAllocation() {
    setAllocationValues(initialAllocationValues);
  }

  return (
    <div className="mt-7">
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <p className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <CircleHelp
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-primary"
          />
          <span>
            <strong>Explore com dados fictícios.</strong> Ajuste os valores para
            ver as posições e a composição responderem. Nada aqui consulta ou
            altera uma conta real; o exemplo não é recomendação nem projeção.
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
        <TabsContent value="posicoes" className="mt-5 motion-content-reveal">
          <AllocationPanel
            values={allocationValues}
            onValueChange={updateAllocation}
            onReset={resetAllocation}
          />
        </TabsContent>
        <TabsContent value="objetivos" className="mt-5 motion-content-reveal">
          <ObjectivesPanel />
        </TabsContent>
        <TabsContent value="estrategia" className="mt-5 motion-content-reveal">
          <StrategyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
