"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/lib/utils";
import {
  PortfolioObjectiveCard,
  type PortfolioObjective,
} from "./portfolio-objective-card";
import { Cell, Pie, PieChart } from "recharts";
import { ChevronDown, Plus } from "lucide-react";

type Data = {
  objectives: PortfolioObjective[];
  destinationSummary: {
    categories: Array<{
      key:
        "reserve" | "personal" | "long_term" | "purpose_unknown" | "unassigned";
      value: number;
      percentage: number;
    }>;
    knownTotal: number;
    missingPositionCount: number;
    unvaluedPositionCount: number;
  };
  unassignedKnownValue: number;
  unassignedPositionCount: number;
  unassignedUnvaluedPositionCount: number;
};

type Props = {
  data: Data;
  deleting: boolean;
  deleteObjectiveId: string | null;
  onOpen: (objective: PortfolioObjective) => void;
  onEdit: (objective: PortfolioObjective) => void;
  onDeleteOpenChange: (objectiveId: string, open: boolean) => void;
  onDelete: (objectiveId: string) => void;
  onCreate: () => void;
  onOrganize?: () => void;
};

export const destinationChartConfig = {
  reserve: { label: "Reserva", color: "var(--destination-reserve)" },
  personal: {
    label: "Objetivos pessoais",
    color: "var(--destination-personal)",
  },
  long_term: {
    label: "Investimento de longo prazo",
    color: "var(--destination-long-term)",
  },
  purpose_unknown: {
    label: "Finalidade não definida",
    color: "var(--destination-purpose-unknown)",
  },
  unassigned: { label: "Sem destino", color: "var(--destination-unassigned)" },
} satisfies ChartConfig;

const percent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export function PortfolioObjectivesOverview({
  data,
  deleting,
  deleteObjectiveId,
  onOpen,
  onEdit,
  onDeleteOpenChange,
  onDelete,
  onCreate,
  onOrganize = () => {},
}: Props) {
  const labels = {
    reserve: "Reserva",
    personal: "Objetivos pessoais",
    long_term: "Investimento de longo prazo",
    purpose_unknown: "Finalidade não definida",
    unassigned: "Sem destino",
  } as const;
  const categories = data.destinationSummary.categories.map((category) => ({
    ...category,
    label: labels[category.key],
  }));
  const knownTotal = data.destinationSummary.knownTotal;
  const missingCount = data.destinationSummary.missingPositionCount;
  const unvaluedCount = data.destinationSummary.unvaluedPositionCount;
  const incompleteCount = missingCount + unvaluedCount;
  const chartData = categories.filter((category) => category.value > 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="space-y-1">
              <CardTitle className="text-base">
                Patrimônio por destino
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Valores conhecidos das posições atribuídas.
              </p>
            </div>
            <Badge className="w-fit" variant="outline">
              {incompleteCount > 0 ? "Conhecido · parcial" : "Valor conhecido"}
            </Badge>
          </div>
          <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
            {onOrganize && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={onOrganize}
              >
                Organizar objetivos
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={onCreate}
            >
              <Plus aria-hidden="true" className="size-4" />
              Novo objetivo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid items-center gap-4 pt-2 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div className="relative">
            {chartData.length > 0 ? (
              <ChartContainer
                config={destinationChartConfig}
                className="mx-auto h-47.5 max-w-55"
                aria-label="Gráfico de rosca dos valores conhecidos por destino"
                role="img"
              >
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={76}
                    strokeWidth={3}
                    isAnimationActive={false}
                  >
                    {chartData.map((category) => (
                      <Cell
                        key={category.key}
                        fill={"var(--color-" + category.key + ")"}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div
                aria-label="Sem valores conhecidos para compor o gráfico"
                className="mx-auto flex h-47.5 max-w-55 items-center justify-center rounded-full border border-dashed text-center text-xs text-muted-foreground"
                role="img"
              >
                Nenhum valor conhecido
              </div>
            )}
            {knownTotal > 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(knownTotal)}
                </span>
              </div>
            )}
          </div>
          <ul
            aria-label="Valores e proporções por destino"
            className="space-y-3"
          >
            {chartData.map((category) => {
              return (
                <li
                  key={category.key}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          destinationChartConfig[category.key].color,
                      }}
                    />
                    <span className="truncate text-sm">{category.label}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums">
                      {formatCurrency(category.value)}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {percent.format(category.percentage)}%
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
        <CardContent className="pt-0">
          <Collapsible>
            <CollapsibleTrigger className="group flex min-h-9 items-center gap-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Como ler estes valores
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 pt-2 text-xs text-muted-foreground">
              <p>
                Cada posição inteira pode pertencer a apenas um destino. O
                gráfico soma apenas os valores conhecidos da carteira atual.
              </p>
              <p>
                {data.unassignedPositionCount} posição(ões) ainda sem destino.
                {missingCount > 0 &&
                  " " +
                    missingCount +
                    " vínculo(s) não encontrados na carteira atual."}
                {unvaluedCount > 0 &&
                  " " +
                    unvaluedCount +
                    " posição(ões) sem valor conhecido não entram no gráfico."}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <section aria-labelledby="objectives-summary-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="objectives-summary-title" className="text-sm font-semibold">
              Seus objetivos
            </h3>
            <p className="text-xs text-muted-foreground">
              Cada posição pertence a no máximo um destino.
            </p>
          </div>
        </div>
        {data.objectives.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.objectives.map((objective) => (
              <PortfolioObjectiveCard
                key={objective.id}
                objective={objective}
                deleteDialogOpen={deleteObjectiveId === objective.id}
                deleting={deleting}
                onOpen={onOpen}
                onEdit={onEdit}
                onDeleteOpenChange={(open) =>
                  onDeleteOpenChange(objective.id, open)
                }
                onDelete={() => onDelete(objective.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            Nenhum objetivo pessoal cadastrado. Você pode começar por uma meta
            que já tenha em mente.
          </p>
        )}
      </section>
    </div>
  );
}
