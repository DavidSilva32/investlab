import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  WalletCards,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortfolioInsights } from "@/lib/portfolio-insights";
import type { PortfolioConcentration } from "@/lib/portfolio-concentration";
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
  valuationSource?: "MTM" | "CURVA" | "FECHAMENTO" | "INFORMADO" | null;
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
  estimatedValueCents?: string | null;
  canonicalValueCents?: string | null;
  canonicalValueSource?: string;
  reportedValueCents?: string | null;
  estimatedThrough?: string | null;
  cdbProjectedFromDate?: string | null;
  cdbProjectedThroughDate?: string | null;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
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

export function PortfolioOverview({
  positions,
  insights,
  classDistribution,
  classificationStatus,
  summaryContent,
}: {
  positions: PortfolioPosition[];
  insights: PortfolioInsights;
  classDistribution: PortfolioConcentration | null;
  classificationStatus: "loading" | "loaded" | "unavailable";
  summaryContent?: React.ReactNode;
}) {
  const nextMaturity = insights.upcomingMaturities[0];
  const hasAttention =
    insights.unvaluedPositions > 0 ||
    insights.provisionalEstimates > 0 ||
    insights.unavailableEstimates > 0 ||
    nextMaturity !== undefined;

  const institutionDistribution = insights.chartAllocations.map((item) => ({
    label: item.institution,
    value: item.value,
    percentage: item.percentage,
  }));
  const classItems = classDistribution?.chartGroups.map((item) => ({
    label: item.label,
    value: item.value,
    percentage: item.percentage,
  }));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)] lg:items-center">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:size-14">
              <WalletCards aria-hidden="true" className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">
                Valor conhecido da carteira
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-primary tabular-nums sm:text-4xl">
                {insights.valuedPositions
                  ? formatCurrency(insights.totalValue)
                  : "—"}
              </p>
            </div>
          </div>
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="rounded-xl bg-muted/35 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">
                Posições com valor
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {insights.valuedPositions} de {positions.length}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  posições com valor
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-muted/35 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">
                Qualidade dos valores
              </p>
              <p className="mt-1 text-sm font-semibold">
                {insights.provisionalEstimates === 0 &&
                insights.unavailableEstimates === 0
                  ? "Sem estimativas pendentes"
                  : `${insights.provisionalEstimates + insights.unavailableEstimates} posição(ões) com ressalva`}
              </p>
              {(insights.provisionalEstimates > 0 ||
                insights.unavailableEstimates > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Alguns valores podem ser estimativas.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {summaryContent}

      <PortfolioDistributionCharts
        institutionItems={institutionDistribution}
        classItems={classItems ?? null}
        unclassifiedValue={classDistribution?.unclassifiedValue ?? null}
        unclassifiedPercentage={
          classDistribution?.unclassifiedPercentage ?? null
        }
        loading={classificationStatus === "loading"}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
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
          {insights.topPositions.length ? (
            <div className="overflow-hidden rounded-xl border bg-card">
              <ul
                className="divide-y"
                aria-label="Principais posições por valor conhecido"
              >
                {insights.topPositions.map(
                  (
                    { product, institution, value, percentage: share },
                    index,
                  ) => (
                    <li
                      key={`${product}:${institution ?? ""}:${index}`}
                      className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {product}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {institution ?? "Instituição não informada"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {formatCurrency(value)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {percentage.format(share)}% da carteira conhecida
                        </p>
                      </div>
                    </li>
                  ),
                )}
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
                {insights.unvaluedPositions > 0 && (
                  <AttentionItem>
                    {insights.unvaluedPositions}{" "}
                    {insights.unvaluedPositions === 1
                      ? "posição está"
                      : "posições estão"}{" "}
                    sem valor atual informado.
                  </AttentionItem>
                )}
                {insights.provisionalEstimates > 0 && (
                  <AttentionItem>
                    {insights.provisionalEstimates}{" "}
                    {insights.provisionalEstimates === 1
                      ? "estimativa está"
                      : "estimativas estão"}{" "}
                    provisória{insights.provisionalEstimates === 1 ? "" : "s"}.
                  </AttentionItem>
                )}
                {insights.unavailableEstimates > 0 && (
                  <AttentionItem>
                    Não foi possível atualizar{" "}
                    {insights.unavailableEstimates === 1
                      ? "uma estimativa"
                      : `${insights.unavailableEstimates} estimativas`}{" "}
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
              Estes são fatos dos dados registrados; não indicam, por si só,
              risco ou recomendação.
            </p>
          </CardContent>
        </Card>
      </div>
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
