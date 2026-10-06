import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardWealthSummary({
  positions,
  insights,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
}) {
  const referenceDates = [
    ...new Set(
      positions
        .map((position) => position.referenceDate)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const referenceDate =
    referenceDates.length === 1 &&
    positions.length > 0 &&
    positions.every((position) => position.referenceDate === referenceDates[0])
      ? referenceDates[0]
      : null;
  const dataDateIsMixed = referenceDates.length > 0 && referenceDate === null;
  const missingValueCount = insights.unvaluedPositions;

  return (
    <section aria-labelledby="dashboard-where-am-i">
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)_minmax(12rem,0.8fr)] lg:items-center">
          <div className="min-w-0">
            <h2 id="dashboard-where-am-i" className="text-lg font-semibold">
              Patrimônio conhecido
            </h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {insights.valuedPositions
                ? formatCurrency(insights.totalValue)
                : "Ainda sem valores conhecidos"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Patrimônio da carteira que o InvestLab conhece
            </p>
          </div>

          <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:py-2 lg:pl-5">
            <p className="text-xs font-medium text-muted-foreground">
              Posições com valor
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {insights.valuedPositions} de {positions.length}
            </p>
            {missingValueCount > 0 && (
              <p className="mt-1 text-xs text-status-warning">
                {missingValueCount} sem valor atual
              </p>
            )}
          </div>
          <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:py-2 lg:pl-5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Data-base
            </p>
            <p className="mt-1 text-sm font-semibold">
              {referenceDate
                ? `Dados de ${date.format(new Date(`${referenceDate}T00:00:00Z`))}`
                : dataDateIsMixed
                  ? "Datas-base variadas ou incompletas"
                  : "Não informada"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dos valores registrados
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
