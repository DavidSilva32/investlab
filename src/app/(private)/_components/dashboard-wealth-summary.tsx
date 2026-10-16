import { Card, CardContent } from "@/components/ui/card";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";

export function DashboardWealthSummary({
  positions,
  insights,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
}) {
  const missingValueCount = insights.unvaluedPositions;

  return (
    <section aria-labelledby="dashboard-where-am-i">
      <Card className="motion-content-reveal overflow-hidden shadow-sm">
        <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)] lg:items-center">
          <div className="min-w-0">
            <h2 id="dashboard-where-am-i" className="text-lg font-semibold">
              Patrimônio conhecido
            </h2>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-primary tabular-nums sm:text-4xl">
              {insights.valuedPositions
                ? formatCurrency(insights.totalValue)
                : "Ainda sem valores conhecidos"}
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
        </CardContent>
      </Card>
    </section>
  );
}
