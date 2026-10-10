"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  MinusCircle,
  Search,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { AssetLogo } from "@/components/asset-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, apiRequestWithResponse } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  evaluateStockCriteria,
  type StockQualityCriterionKey,
  type StockCriterionResult,
  type StockValuationCriterionKey,
  type StockCriteriaStatus,
} from "@/lib/stock-criteria-evaluation";
import { useStockCriteriaPreferences } from "@/lib/stock-criteria-preferences";
import type { StockAnalysis } from "@/app/analyses/_components/stock-analysis-types";

type OpportunityPriceReference = {
  value: number | null;
  differencePercent: number | null;
  asOf: string | null;
};

type PortfolioOpportunity = {
  ticker: string;
  logoUrl?: string | null;
  name: string;
  quantity: number;
  price: number | null;
  priceAsOf: string | null;
  methods: {
    graham: OpportunityPriceReference;
    bazin: OpportunityPriceReference;
  };
};

type PortfolioOpportunitiesResponse = {
  opportunities: PortfolioOpportunity[];
  classificationStatus: "resolved" | "partial" | "unavailable";
  classificationLookupFailures: number;
};

const criterionLabels = [
  { group: "valuationCriteria", key: "pe", label: "P/L" },
  { group: "valuationCriteria", key: "pb", label: "P/VP" },
  { group: "qualityCriteria", key: "roe", label: "ROE" },
  {
    group: "qualityCriteria",
    key: "netDebtToEbitda",
    label: "Dív. Líq./EBITDA",
  },
  { group: "qualityCriteria", key: "roic", label: "ROIC" },
] as const;

const maxConcurrentStockAnalyses = 4;
let activeStockAnalyses = 0;
const queuedStockAnalyses: Array<() => void> = [];

async function withStockAnalysisConcurrency<T>(request: () => Promise<T>) {
  if (activeStockAnalyses >= maxConcurrentStockAnalyses)
    await new Promise<void>((resolve) => queuedStockAnalyses.push(resolve));
  activeStockAnalyses += 1;
  try {
    return await request();
  } finally {
    activeStockAnalyses -= 1;
    queuedStockAnalyses.shift()?.();
  }
}

const statusStyles: Record<
  StockCriteriaStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  meets: {
    label: "Atende",
    className:
      "border-status-success/40 bg-status-success/10 text-status-success",
    Icon: CheckCircle2,
  },
  fails: {
    label: "Não atende",
    className: "border-status-danger/40 bg-status-danger/10 text-status-danger",
    Icon: XCircle,
  },
  unavailable: {
    label: "Sem dado confiável",
    className: "border-border bg-muted/60 text-muted-foreground",
    Icon: CircleHelp,
  },
  not_applicable: {
    label: "Não aplicável",
    className: "border-border bg-muted/30 text-muted-foreground",
    Icon: MinusCircle,
  },
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "UTC",
});
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function dateText(value: string | null) {
  if (!value) return "data indisponível";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    ? date.format(parsed)
    : "data indisponível";
}

function indicatorValue(
  result: StockCriterionResult,
  key: "pe" | "pb" | "roe",
) {
  if (key === "pb" && result.reason === "threshold_not_configured")
    return `${number.format(result.value!)}x`;
  if (result.status !== "meets" && result.status !== "fails") return "—";
  return `${number.format(result.value!)}${key === "roe" ? "%" : "x"}`;
}

function getEvaluation(
  analysis: StockAnalysis,
  opportunity: PortfolioOpportunity,
  preferences: ReturnType<typeof useStockCriteriaPreferences>,
) {
  const roe = analysis.indicators.find((indicator) => indicator.key === "roe");
  const roePeriod =
    roe?.referenceDate && roe.sourceDocument
      ? analysis.fundamentals.find(
          (period) =>
            period.referenceDate === roe.referenceDate &&
            period.sourceDocument === roe.sourceDocument &&
            period.equity !== null,
        )
      : undefined;
  const staleFundamentals = analysis.fundamentalsIsStale === true;
  const stalePrice = analysis.priceIsStale === true;
  const indicators = analysis.indicators.map((indicator) => ({
    ...indicator,
    value:
      staleFundamentals ||
      ((indicator.key === "pe" || indicator.key === "pb") && stalePrice)
        ? null
        : indicator.value,
    unavailableReason:
      staleFundamentals ||
      ((indicator.key === "pe" || indicator.key === "pb") && stalePrice)
        ? "Os dados estão desatualizados para avaliação."
        : indicator.unavailableReason,
  }));
  return evaluateStockCriteria({
    instrument: analysis.instrumentType ?? "unknown",
    sector: analysis.issuerSector ?? null,
    indicators,
    equity:
      staleFundamentals || !roePeriod?.equity ? null : Number(roePeriod.equity),
    equityReferenceDate: staleFundamentals
      ? null
      : (roePeriod?.referenceDate ?? null),
    price: stalePrice ? null : analysis.price,
    grahamReferencePrice: opportunity.methods.graham.value,
    // The observed 12-month dividend feed does not prove a complete recurring series.
    recurringDividendCoverageComplete: false,
    preferences,
  });
}

function CriterionBadge({
  ticker,
  label,
  result,
}: {
  ticker: string;
  label: string;
  result: StockCriterionResult;
}) {
  const presentation = statusStyles[result.status];
  const Icon = presentation.Icon;
  const value =
    label === "P/L" || label === "ROE" || label === "P/VP"
      ? indicatorValue(
          result,
          label === "P/L" ? "pe" : label === "P/VP" ? "pb" : "roe",
        )
      : presentation.label;
  const hasNumericValue =
    (label === "P/L" || label === "ROE" || label === "P/VP") &&
    (result.status === "meets" ||
      result.status === "fails" ||
      (label === "P/VP" && result.reason === "threshold_not_configured"));
  const resultLabel =
    label === "P/VP" && result.reason === "threshold_not_configured"
      ? "Sem limite configurado"
      : presentation.label;
  return (
    <Badge
      variant="outline"
      className={`h-7 gap-1.5 whitespace-nowrap px-2 text-[11px] font-medium ${presentation.className}`}
      aria-label={`${ticker} ${label}: ${resultLabel}${hasNumericValue ? `, ${value}` : ""}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
      <span className="font-normal opacity-90">{value}</span>
    </Badge>
  );
}

function PriceReference({
  label,
  reference,
}: {
  label: string;
  reference: OpportunityPriceReference;
}) {
  const difference = reference.differencePercent;
  const below = difference !== null && difference > 0;
  const equal = difference === 0;
  const Icon =
    difference === null ? AlertCircle : below ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      aria-label={
        difference === null
          ? `${label}: referência de preço indisponível`
          : `${label}: ${percent.format(Math.abs(difference) / 100)} ${below ? "abaixo da" : equal ? "igual à" : "acima da"} referência`
      }
    >
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span>{label}</span>
      <span>
        {difference === null
          ? "sem referência"
          : `${percent.format(Math.abs(difference) / 100)} ${below ? "abaixo" : equal ? "na" : "acima"}`}
      </span>
    </span>
  );
}

export function NextContributionStockOpportunities() {
  const preferences = useStockCriteriaPreferences();
  const opportunitiesQuery = useQuery({
    queryKey: queryKeys.analyses.opportunities(),
    queryFn: () =>
      apiRequest<PortfolioOpportunitiesResponse>(
        "/api/analyses/portfolio-opportunities",
        undefined,
        "Não foi possível carregar ações da carteira.",
      ),
  });
  const opportunities = opportunitiesQuery.data?.opportunities ?? [];
  const analyses = useQueries({
    queries: opportunities.map((opportunity) => ({
      queryKey: queryKeys.analyses.stock(opportunity.ticker.toUpperCase()),
      queryFn: () =>
        withStockAnalysisConcurrency(async () => {
          const { data } = await apiRequestWithResponse<StockAnalysis>(
            `/api/analyses/stocks/${encodeURIComponent(opportunity.ticker)}`,
            undefined,
            "Não foi possível carregar os indicadores da ação.",
          );
          return data;
        }),
    })),
  });

  if (opportunitiesQuery.isPending) {
    return (
      <Card aria-label="Carregando ações da carteira" aria-busy="true">
        <CardHeader className="flex-row items-center gap-3 space-y-0 p-4">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (opportunitiesQuery.isError) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p role="status" className="text-sm text-muted-foreground">
            A lista de ações não está disponível agora.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void opportunitiesQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const portfolioUnavailable =
    opportunitiesQuery.data.classificationStatus === "unavailable";
  const partialClassification =
    opportunitiesQuery.data.classificationStatus === "partial";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base">Ações da carteira</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Indicadores para estudo; não são ordem de compra.
            </CardDescription>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {opportunities.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        {portfolioUnavailable ? (
          <p role="status" className="text-sm text-muted-foreground">
            Não foi possível confirmar as ações nesta consulta.
          </p>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              {partialClassification
                ? "Algumas posições não puderam ser confirmadas como ações."
                : "Nenhuma ação B3 foi confirmada na carteira."}
            </p>
            <Button asChild type="button" variant="ghost" size="sm">
              <Link href="/analyses">
                <Search className="mr-2 size-4" aria-hidden="true" />
                Análises
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {partialClassification && (
              <p role="status" className="text-xs text-status-warning">
                Não foi possível confirmar{" "}
                {opportunitiesQuery.data.classificationLookupFailures} ativo(s).
              </p>
            )}
            <ul className="divide-y rounded-lg border">
              {opportunities.map((opportunity, index) => {
                const analysisQuery = analyses[index];
                const analysis = analysisQuery?.data;
                const evaluation = analysis
                  ? getEvaluation(analysis, opportunity, preferences)
                  : null;
                const qualityCriteria = evaluation
                  ? Object.values(evaluation.qualityCriteria)
                  : [];
                const assessedQuality = qualityCriteria.filter(
                  ({ status }) => status === "meets" || status === "fails",
                );
                const metQuality = assessedQuality.filter(
                  ({ status }) => status === "meets",
                ).length;
                return (
                  <li key={opportunity.ticker} className="space-y-2 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <AssetLogo
                          ticker={opportunity.ticker}
                          name={opportunity.name}
                          logoUrl={opportunity.logoUrl}
                          size="sm"
                        />
                        <span className="font-semibold tabular-nums">
                          {opportunity.ticker}
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {opportunity.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {opportunity.price === null
                            ? "Cotação indisponível"
                            : money.format(opportunity.price)}
                        </span>
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                        >
                          <Link
                            href={`/analyses?ticker=${encodeURIComponent(opportunity.ticker)}`}
                            aria-label={`Abrir análise de ${opportunity.ticker}`}
                          >
                            <Search
                              className="mr-1.5 size-3.5"
                              aria-hidden="true"
                            />
                            Analisar
                          </Link>
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Cotação {dateText(opportunity.priceAsOf)}
                      {analysis?.fundamentalsFetchedAt &&
                        ` · demonstrações consultadas ${dateText(analysis.fundamentalsFetchedAt)}`}
                    </p>
                    {analysisQuery?.isPending ? (
                      <div
                        className="flex flex-wrap gap-2"
                        role="status"
                        aria-label={`Carregando indicadores de ${opportunity.ticker}`}
                      >
                        <Skeleton className="h-7 w-24" />
                        <Skeleton className="h-7 w-24" />
                        <Skeleton className="h-7 w-24" />
                      </div>
                    ) : analysisQuery?.isError || !analysis || !evaluation ? (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Indicadores indisponíveis. Consulte a análise completa.
                      </p>
                    ) : (
                      <>
                        <div
                          className="flex flex-wrap items-center gap-1.5"
                          aria-label={`Critérios de ${opportunity.ticker}`}
                        >
                          {criterionLabels.map((criterion) => {
                            const result =
                              criterion.group === "valuationCriteria"
                                ? evaluation.valuationCriteria[
                                    criterion.key as StockValuationCriterionKey
                                  ]
                                : evaluation.qualityCriteria[
                                    criterion.key as StockQualityCriterionKey
                                  ];
                            return (
                              <CriterionBadge
                                key={criterion.key}
                                ticker={opportunity.ticker}
                                label={criterion.label}
                                result={result}
                              />
                            );
                          })}
                          <Badge
                            variant="outline"
                            className="h-7 gap-1.5 border-border bg-muted/60 px-2 text-[11px] font-medium text-muted-foreground"
                            aria-label={`${opportunity.ticker} DY: sem série recorrente completa`}
                          >
                            <CircleHelp
                              className="size-3.5"
                              aria-hidden="true"
                            />
                            DY{" "}
                            <span className="font-normal">
                              sem série recorrente
                            </span>
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {assessedQuality.length === 0
                              ? "Qualidade sem base confiável"
                              : `Qualidade · ${metQuality}/${assessedQuality.length} indicadores avaliáveis atendidos`}
                          </span>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Preço de referência
                            </span>
                            <PriceReference
                              label="Graham"
                              reference={opportunity.methods.graham}
                            />
                            <span
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                              aria-label="Bazin indisponível: série de dividendos recorrentes não comprovada"
                            >
                              <CircleHelp
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              Bazin sem série recorrente
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Indicadores de qualidade e referências de preço são leituras
              distintas. Dados ausentes ou antigos permanecem sem sinal.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
