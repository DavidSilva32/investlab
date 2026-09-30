import {
  ChevronDown,
  Minus,
  TrendingDown,
  TrendingUp,
  CircleHelp,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { AnalysisPeriod } from "./stock-analysis-types";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  signDisplay: "always",
  maximumFractionDigits: 1,
});

type Metric = "revenue" | "netIncome";
type Direction = "up" | "down" | "same";

const metrics: Record<Metric, { label: string; shortLabel: string }> = {
  revenue: { label: "Receita anual", shortLabel: "Receita" },
  netIncome: { label: "Lucro líquido anual", shortLabel: "Lucro líquido" },
};

function numericValue(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function direction(current: number, previous: number): Direction {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "same";
}

function DirectionIcon({ value }: { value: Direction }) {
  const Icon =
    value === "up" ? TrendingUp : value === "down" ? TrendingDown : Minus;
  return <Icon className="size-4 shrink-0" aria-hidden="true" />;
}

function periodLabel(period: AnalysisPeriod) {
  return period.referenceDate.slice(0, 4);
}

function changePercent(current: number, previous: number) {
  // Percent changes from zero or negative profit do not have a clear,
  // conventionally useful interpretation. Keep the nominal movement visible.
  if (previous <= 0) return null;
  return percent.format((current - previous) / previous);
}

function Result({
  latest,
  value,
}: {
  latest: AnalysisPeriod;
  value: number | null;
}) {
  const label =
    value === null
      ? "Valor não informado"
      : value > 0
        ? "Resultado positivo"
        : value < 0
          ? "Resultado negativo"
          : "Resultado zerado";
  const tone =
    value === null
      ? "text-muted-foreground"
      : value > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : value < 0
          ? "text-rose-600 dark:text-rose-400"
          : "text-muted-foreground";
  const Icon = value === null ? CircleHelp : value === 0 ? Minus : null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ${tone}`}
      >
        {Icon ? (
          <Icon className="size-4" aria-hidden="true" />
        ) : value !== null && value > 0 ? (
          <TrendingUp className="size-4" aria-hidden="true" />
        ) : (
          <TrendingDown className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">Lucro líquido do exercício</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            Exercício {periodLabel(latest)}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className={`text-lg font-semibold tabular-nums ${tone}`}>
            {value === null ? "Indisponível" : money.format(value)}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function Comparison({
  metric,
  previous,
  current,
}: {
  metric: Metric;
  previous: AnalysisPeriod;
  current: AnalysisPeriod;
}) {
  // The caller only renders metrics whose two annual values are numeric.
  const before = numericValue(previous[metric])!;
  const after = numericValue(current[metric])!;

  const movement = direction(after, before);
  const nominalChange = after - before;
  const percentageChange = changePercent(after, before);
  const tone =
    movement === "up"
      ? "text-sky-700 dark:text-sky-300"
      : movement === "down"
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";
  const movementLabel =
    movement === "up"
      ? "Aumentou"
      : movement === "down"
        ? "Diminuiu"
        : "Sem variação nominal";
  const variation =
    movement === "same"
      ? "Mesmo valor"
      : `${movementLabel} ${money.format(Math.abs(nominalChange))}${percentageChange ? ` (${percentageChange})` : ""}`;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ${tone}`}
      >
        <DirectionIcon value={movement} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{metrics[metric].label}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {periodLabel(previous)} → {periodLabel(current)}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-base font-semibold tabular-nums">
            {money.format(after)}
          </p>
          <p className={`text-xs font-medium tabular-nums ${tone}`}>
            {variation}
          </p>
        </div>
      </div>
    </div>
  );
}

function FactRow({ children }: { children: ReactNode }) {
  return <li className="py-3 first:pt-0 last:pb-0">{children}</li>;
}

export function StockAnalysisReading({
  periods,
}: {
  periods: AnalysisPeriod[];
}) {
  const annual = periods
    .filter((period) => period.sourceDocument === "DFP")
    .slice()
    .sort((left, right) =>
      left.referenceDate.localeCompare(right.referenceDate),
    );
  const latest = annual.at(-1);
  const previous = annual.at(-2);
  const consecutive =
    latest !== undefined &&
    previous !== undefined &&
    Number(latest.referenceDate.slice(0, 4)) -
      Number(previous.referenceDate.slice(0, 4)) ===
      1 &&
    latest.referenceDate.slice(5) === previous.referenceDate.slice(5);

  if (!latest) {
    return (
      <p className="text-sm text-muted-foreground">
        Ainda não há demonstrações anuais disponíveis para resumir a situação
        financeira desta empresa.
      </p>
    );
  }

  const latestProfit = numericValue(latest.netIncome);
  const comparableMetrics =
    consecutive && previous
      ? (["revenue", "netIncome"] as const).filter(
          (metric) =>
            numericValue(previous[metric]) !== null &&
            numericValue(latest[metric]) !== null,
        )
      : [];

  return (
    <div className="space-y-3">
      <ul
        className="divide-y divide-border"
        aria-label="Síntese dos dados anuais"
      >
        <FactRow>
          <Result latest={latest} value={latestProfit} />
        </FactRow>
        {previous && comparableMetrics.length > 0 ? (
          <>
            {comparableMetrics.map((metric) => (
              <FactRow key={metric}>
                <Comparison
                  metric={metric}
                  previous={previous}
                  current={latest}
                />
              </FactRow>
            ))}
          </>
        ) : (
          <li className="flex items-center gap-2 border-t py-3 text-xs text-muted-foreground">
            <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
            Sem períodos anuais consecutivos e alinhados com valores suficientes
            para comparar receita e lucro.
          </li>
        )}
      </ul>
      <Collapsible>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="text-xs text-muted-foreground">
            Valores anuais nominais, sem ajuste pela inflação.
          </span>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
            >
              Como ler estes dados
              <ChevronDown
                className="size-3.5 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            Comparamos exercícios anuais consecutivos com a mesma data de
            encerramento informada e valores numéricos disponíveis. A duração
            exata dos períodos não é validada pelos dados recebidos. A variação
            em reais mostra a diferença nominal; o percentual é exibido apenas
            quando o valor do exercício anterior é positivo. Mudanças de
            critérios contábeis ou reclassificações não são ajustadas. Lucro e
            crescimento não indicam, por si só, qualidade da empresa nem
            recomendação de investimento.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
