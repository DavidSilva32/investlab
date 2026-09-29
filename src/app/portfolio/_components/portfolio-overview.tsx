import Link from "next/link";
import { ArrowRight, CalendarDays, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { getPortfolioConcentration } from "@/lib/portfolio-concentration";
import { formatCurrency } from "@/lib/utils";
import { PortfolioDistributionCharts } from "./portfolio-distribution-charts";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const percentage = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type PortfolioPosition = {
  id: string;
  source?: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  indexer: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  quantity: string;
  unitPrice?: string | null;
  totalValue: string | null;
  reportedTotalValue?: string | null;
  currency?: string;
  valueBasis?: "unit_price" | "total_value";
  positionDate?: string;
  convertedValueBrl?: string | null;
  conversionDate?: string | null;
  estimationBaseDate?: string | null;
  cdiPercentage?: string | null;
  estimatedValue?: number | null;
  estimatedThrough?: string | null;
  cdbEstimateStatus?: "official" | "provisional" | "unavailable" | null;
};

export type ClassifiedPosition = {
  id: string;
  product: string;
  assetCode?: string | null;
  issuer?: string | null;
  institution?: string | null;
  indexer?: string | null;
  regimeType?: string | null;
  referenceDate?: string | null;
  conversionDate?: string | null;
  estimatedThrough?: string | null;
  totalValue: string | null;
  estimatedValue?: number | null;
  classification: {
    assetClass: string | null;
    subClass: string | null;
    geography: string | null;
  };
};

function positionValue(position: PortfolioPosition) {
  const value =
    position.estimatedValue ??
    (position.totalValue === null ? null : Number(position.totalValue));
  return value !== null && Number.isFinite(value) ? value : null;
}

export function PortfolioOverview({
  positions,
  classifiedPositions,
  classificationStatus,
  summaryContent,
}: {
  positions: PortfolioPosition[];
  classifiedPositions: ClassifiedPosition[] | null;
  classificationStatus: "loading" | "loaded" | "unavailable";
  summaryContent?: React.ReactNode;
}) {
  const insights = getPortfolioInsights(positions);
  const classDistribution = classifiedPositions
    ? getPortfolioConcentration(classifiedPositions, "assetClass")
    : null;
  const valuedPositions = positions
    .map((position) => ({ position, value: positionValue(position) }))
    .filter(
      (item): item is { position: PortfolioPosition; value: number } =>
        item.value !== null,
    )
    .sort((left, right) => right.value - left.value);
  const topPositions = valuedPositions.slice(0, 5);
  const unvaluedCount = positions.length - valuedPositions.length;
  const provisionalCount = positions.filter(
    (position) => position.cdbEstimateStatus === "provisional",
  ).length;
  const unavailableEstimateCount = positions.filter(
    (position) => position.cdbEstimateStatus === "unavailable",
  ).length;
  const nextMaturity = insights.upcomingMaturities[0];
  const hasAttention =
    unvaluedCount > 0 ||
    provisionalCount > 0 ||
    unavailableEstimateCount > 0 ||
    nextMaturity !== undefined;

  const institutionDistribution = insights.allocations.map((item) => ({
    label: item.institution,
    value: item.value,
    percentage: item.percentage,
  }));
  const classItems = classDistribution?.groups.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <p className="text-sm text-muted-foreground">
              Valor conhecido da carteira
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
              {insights.valuedPositions
                ? formatCurrency(insights.totalValue)
                : "—"}
            </p>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            <p>
              {valuedPositions.length} de {positions.length} posições com valor
            </p>
            {(provisionalCount > 0 || unavailableEstimateCount > 0) && (
              <p className="mt-1">Alguns valores podem ser estimativas.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {summaryContent}

      <PortfolioDistributionCharts
        institutionItems={institutionDistribution}
        classItems={classItems ?? null}
        unclassifiedValue={classDistribution?.unclassifiedValue ?? null}
        totalValue={classDistribution?.totalValue ?? null}
        loading={classificationStatus === "loading"}
      />

      <section aria-labelledby="top-positions-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="top-positions-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Principais posições
            </h2>
            <p className="text-sm text-muted-foreground">
              Ordenadas pelo maior valor conhecido
            </p>
          </div>
          <Link
            href="/portfolio?view=positions"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todas as posições <ArrowRight className="size-4" />
          </Link>
        </div>
        {topPositions.length ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul
              className="divide-y"
              aria-label="Principais posições por valor conhecido"
            >
              {topPositions.map(({ position, value }) => (
                <li
                  key={position.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {position.product}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {position.institution ?? "Instituição não informada"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {formatCurrency(value)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {percentage.format(
                        insights.totalValue > 0
                          ? (value / insights.totalValue) * 100
                          : 0,
                      )}
                      % da carteira conhecida
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded-xl border px-4 py-5 text-sm text-muted-foreground">
            Ainda não há posições com valor conhecido.
          </p>
        )}
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que merece atenção</CardTitle>
        </CardHeader>
        <CardContent>
          {hasAttention ? (
            <ul className="space-y-3">
              {unvaluedCount > 0 && (
                <AttentionItem>
                  {unvaluedCount}{" "}
                  {unvaluedCount === 1 ? "posição está" : "posições estão"} sem
                  valor atual informado.
                </AttentionItem>
              )}
              {provisionalCount > 0 && (
                <AttentionItem>
                  {provisionalCount}{" "}
                  {provisionalCount === 1
                    ? "estimativa está"
                    : "estimativas estão"}{" "}
                  provisória{provisionalCount === 1 ? "" : "s"}.
                </AttentionItem>
              )}
              {unavailableEstimateCount > 0 && (
                <AttentionItem>
                  Não foi possível atualizar{" "}
                  {unavailableEstimateCount === 1
                    ? "uma estimativa"
                    : `${unavailableEstimateCount} estimativas`}{" "}
                  de CDB; a tabela mostra o último valor informado.
                </AttentionItem>
              )}
              {nextMaturity && (
                <AttentionItem icon={<CalendarDays className="size-4" />}>
                  Próximo vencimento informado: {nextMaturity.product}, em{" "}
                  {date.format(
                    new Date(`${nextMaturity.maturityAt}T00:00:00Z`),
                  )}
                  .
                </AttentionItem>
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Não há valores ausentes ou estimativas pendentes informados na
              carteira.
            </p>
          )}
          <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
            Estes são fatos dos dados registrados; não indicam, por si só, risco
            ou recomendação.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AttentionItem({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 text-muted-foreground">
        {icon ?? <CircleAlert className="size-4" />}
      </span>
      <span>{children}</span>
    </li>
  );
}
