"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleHelp,
  CircleX,
  MinusCircle,
  X,
} from "lucide-react";
import { AssetLogo } from "@/components/asset-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisStockSearch } from "./analysis-stock-search";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { classifyCvmSector } from "@/lib/cvm-sector-classification";
import { useStockCriteriaPreferences } from "@/lib/stock-criteria-preferences";
import type {
  StockCriteriaStatus,
  StockCriterionResult,
} from "@/lib/stock-criteria-evaluation";

type TickerOption = { ticker: string; name: string; logoUrl?: string | null };
type MetricCell = {
  value: number | null;
  referenceDate: string | null;
  periodStart: string | null;
  periodBasis: string | null;
  sourceDocument: "DFP" | "ITR" | null;
  sourceSummary: string | null;
  marketDataDate: string | null;
  accountProvenance: string | null;
  unavailableReason: string | null;
};
type ComparisonCompany = {
  ticker: string;
  logoUrl?: string | null;
  selectedTickers: string[];
  name: string;
  cnpj: string;
  cvmCode: string;
  sector: string | null;
  metadataUpdatedAt: string | null;
  identityVerified: boolean;
  fundamentals: { roe: MetricCell; netMargin: MetricCell };
  valuation: { pe: MetricCell; pb: MetricCell };
};
type ComparisonResult = {
  sector: string | null;
  sectorMetadataAsOf: string | null;
  companies: ComparisonCompany[];
};

const basisLabels: Record<string, string> = {
  annual: "exercício anual",
  year_to_date: "acumulado no exercício",
  quarterly: "trimestre",
  trailing_twelve_months: "LTM",
  point_in_time: "saldo na data-base",
};

function isValidIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

function hasValidTimestamp(value: string | null) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function dateLabel(value: string | null) {
  if (!value) return null;
  const datePart = value.slice(0, 10);
  if (!isValidIsoDate(datePart)) return null;
  const timestamp = Date.parse(
    value.length === 10 ? `${value}T00:00:00.000Z` : value,
  );
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
}

function cellDateLabel(cell: MetricCell) {
  const referenceDate = dateLabel(cell.referenceDate);
  const marketDate = cell.marketDataDate
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(cell.marketDataDate))
    : null;
  const basis = cell.periodBasis ? basisLabels[cell.periodBasis] : null;
  const periodWindow =
    cell.periodBasis === "trailing_twelve_months" && cell.periodStart
      ? `LTM de ${dateLabel(cell.periodStart)} a ${referenceDate}`
      : null;
  return [
    cell.sourceSummary ??
      (cell.sourceDocument ? `CVM ${cell.sourceDocument}` : null),
    basis,
    periodWindow,
    referenceDate ? `até ${referenceDate}` : null,
    marketDate ? `cotação ${marketDate}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const percent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const multiple = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function renderCell(cell: MetricCell, kind: "percent" | "multiple") {
  if (cell.value === null)
    return (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>Indisponível</p>
        <p>{cell.unavailableReason}</p>
        {cellDateLabel(cell) && (
          <p className="text-xs">{cellDateLabel(cell)}</p>
        )}
      </div>
    );
  return (
    <div className="space-y-1">
      <p className="font-semibold tabular-nums">
        {kind === "percent"
          ? `${percent.format(cell.value)}%`
          : `${multiple.format(cell.value)}x`}
      </p>
      {cellDateLabel(cell) && (
        <p className="text-xs text-muted-foreground">{cellDateLabel(cell)}</p>
      )}
      {cell.accountProvenance && (
        <p className="text-xs text-muted-foreground">
          {cell.accountProvenance}
        </p>
      )}
    </div>
  );
}

function ComparisonCriterionStatus({
  company,
  keyName,
  preferences,
}: {
  company: ComparisonCompany;
  keyName: "roe" | "pe" | "pb";
  preferences: ReturnType<typeof useStockCriteriaPreferences>;
}) {
  const cell =
    keyName === "roe"
      ? company.fundamentals.roe
      : keyName === "pe"
        ? company.valuation.pe
        : company.valuation.pb;
  const classification = classifyCvmSector(company.sector);
  const normalizedSector = (company.sector ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
  const isBankSector = normalizedSector === "BANCOS";
  const supportedSector =
    classification === "financial" || classification === "non_financial";
  const financialRoeNotApplicable =
    keyName === "roe" && classification === "financial" && !isBankSector;
  const peNotApplicable =
    keyName === "pe" && classification === "financial" && !isBankSector;
  const isValuation = keyName !== "roe";
  const hasComparablePeriod =
    keyName === "pe"
      ? cell.periodBasis === "annual" ||
        cell.periodBasis === "trailing_twelve_months"
      : keyName === "pb"
        ? true
        : isBankSector
          ? cell.periodBasis === "trailing_twelve_months"
          : cell.periodBasis === "annual" ||
            cell.periodBasis === "trailing_twelve_months";
  const hasSource = Boolean(cell.sourceDocument && cell.sourceSummary);
  const baseComparable =
    company.identityVerified &&
    supportedSector &&
    cell.value !== null &&
    Number.isFinite(cell.value) &&
    isValidIsoDate(cell.referenceDate) &&
    hasSource &&
    cell.unavailableReason === null &&
    hasComparablePeriod &&
    (!isValuation || hasValidTimestamp(cell.marketDataDate));
  let criterion: StockCriterionResult;
  if (financialRoeNotApplicable || peNotApplicable) {
    criterion = {
      status: "not_applicable",
      reason: "financial_sector_methodology_required",
      value: null,
      threshold: null,
    };
  } else if (!baseComparable || (keyName !== "roe" && cell.value! <= 0)) {
    criterion = {
      status: "unavailable",
      reason: "indicator_unavailable",
      value: null,
      threshold: null,
    };
  } else if (keyName === "pb" && preferences.maximumPb === null) {
    criterion = {
      status: "unavailable",
      reason: "threshold_not_configured",
      value: cell.value,
      threshold: null,
    };
  } else {
    const threshold =
      keyName === "roe"
        ? preferences.minimumRoePercent
        : keyName === "pe"
          ? preferences.maximumPe
          : preferences.maximumPb!;
    const meets =
      keyName === "roe" ? cell.value! >= threshold : cell.value! <= threshold;
    criterion = {
      status: meets ? "meets" : "fails",
      reason: meets ? "within_threshold" : "outside_threshold",
      value: cell.value,
      threshold,
    };
  }
  const status = criterion.status;
  const keyLabel = keyName === "pe" ? "P/L" : keyName === "pb" ? "P/VP" : "ROE";
  const presentation = {
    meets: {
      label:
        keyName === "roe"
          ? `Acima do mínimo · ${percent.format(criterion.threshold!)}%`
          : `Até ${multiple.format(criterion.threshold!)}x`,
      className:
        "border-status-success/30 bg-status-success/10 text-status-success",
      Icon: CheckCircle2,
    },
    fails: {
      label:
        keyName === "roe"
          ? `Abaixo do mínimo · ${percent.format(criterion.threshold!)}%`
          : `Acima de ${multiple.format(criterion.threshold!)}x`,
      className:
        "border-status-warning/30 bg-status-warning/10 text-status-warning",
      Icon: CircleX,
    },
    unavailable: {
      label:
        criterion.reason === "threshold_not_configured"
          ? `P/VP ${multiple.format(criterion.value!)}x · sem limite`
          : `${keyLabel} sem base confiável`,
      className: "border-border bg-muted/50 text-muted-foreground",
      Icon: CircleHelp,
    },
    not_applicable: {
      label: `${keyLabel} não se aplica`,
      className: "border-border bg-muted/50 text-muted-foreground",
      Icon: MinusCircle,
    },
  }[status];
  const Icon = presentation.Icon;
  return (
    <span
      className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${presentation.className}`}
      aria-label={`${keyLabel}: ${presentation.label}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

export function CompanyComparison({
  initialTicker = "",
}: {
  initialTicker?: string;
}) {
  const initialOption = initialTicker
    ? { ticker: initialTicker.toUpperCase(), name: initialTicker.toUpperCase() }
    : null;
  const [searchTicker, setSearchTicker] = useState(initialOption?.ticker ?? "");
  const [selected, setSelected] = useState<TickerOption[]>(
    initialOption ? [initialOption] : [],
  );
  const [submittedTickers, setSubmittedTickers] = useState<string[]>([]);
  const [shouldCompare, setShouldCompare] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const criteriaPreferences = useStockCriteriaPreferences();
  const comparisonQuery = useQuery({
    queryKey: queryKeys.analyses.comparison(submittedTickers),
    enabled: shouldCompare && submittedTickers.length > 0,
    queryFn: () =>
      apiRequest<ComparisonResult>(
        "/api/analyses/companies/compare",
        {
          method: "POST",
          body: JSON.stringify({ tickers: submittedTickers }),
        },
        "Não foi possível comparar as empresas agora.",
      ),
  });
  const result = comparisonQuery.data ?? null;
  const loading = comparisonQuery.isFetching;
  const queryError =
    shouldCompare && comparisonQuery.error instanceof Error
      ? comparisonQuery.error.message
      : null;
  const error = actionError ?? queryError;
  const displayedSelection =
    shouldCompare && result
      ? result.companies.map((company) => ({
          ticker: company.ticker,
          name: company.name,
          logoUrl: company.logoUrl,
        }))
      : selected;

  function addTicker(option: TickerOption) {
    setSearchTicker(option.ticker);
    setActionError(null);
    setSubmittedTickers([]);
    setShouldCompare(false);
    if (displayedSelection.some((item) => item.ticker === option.ticker))
      return;
    if (displayedSelection.length >= 5) {
      setActionError("É possível comparar até cinco empresas por vez.");
      return;
    }
    setSelected([...displayedSelection, option]);
  }

  function removeTicker(ticker: string) {
    setSelected(displayedSelection.filter((item) => item.ticker !== ticker));
    setSubmittedTickers([]);
    setShouldCompare(false);
    setActionError(null);
  }

  function compare() {
    setActionError(null);
    const tickers = displayedSelection.map((item) => item.ticker);
    if (
      shouldCompare &&
      tickers.length === submittedTickers.length &&
      tickers.every((ticker, index) => ticker === submittedTickers[index])
    ) {
      void comparisonQuery.refetch();
      return;
    }
    setSubmittedTickers(tickers);
    setShouldCompare(true);
  }

  const rows = result?.companies ?? [];
  const sectorMetadataDate = result?.sectorMetadataAsOf
    ? dateLabel(result.sectorMetadataAsOf)
    : null;
  const metricRows: Array<{
    key: "roe" | "netMargin" | "pe" | "pb";
    label: string;
    kind: "percent" | "multiple";
    group: "Fundamentos" | "Valuation";
    get: (company: ComparisonCompany) => MetricCell;
  }> = [
    {
      key: "roe",
      label:
        result?.sector === "Bancos" ? "ROE contábil simplificado LTM" : "ROE",
      kind: "percent",
      group: "Fundamentos",
      get: (company) => company.fundamentals.roe,
    },
    {
      key: "netMargin",
      label: "Margem líquida",
      kind: "percent",
      group: "Fundamentos",
      get: (company) => company.fundamentals.netMargin,
    },
    {
      key: "pe",
      label: "P/L",
      kind: "multiple",
      group: "Valuation",
      get: (company) => company.valuation.pe,
    },
    {
      key: "pb",
      label: "P/VP",
      kind: "multiple",
      group: "Valuation",
      get: (company) => company.valuation.pb,
    },
  ];

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Comparar empresas
        </h2>
      </header>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[minmax(14rem,1.15fr)_minmax(12rem,1fr)_auto] md:items-center md:p-5">
          <AnalysisStockSearch
            ticker={searchTicker}
            onSelect={addTicker}
            showDescription={false}
          />
          <div
            aria-label="Empresas selecionadas"
            className="flex min-h-11 flex-wrap content-center gap-2"
          >
            {displayedSelection.map((option) => (
              <span
                key={option.ticker}
                className="inline-flex h-10 items-center gap-2 rounded-lg border bg-muted px-3 text-sm"
              >
                <AssetLogo
                  ticker={option.ticker}
                  name={option.name}
                  logoUrl={option.logoUrl}
                  size="sm"
                />
                <span className="font-semibold">{option.ticker}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={`Remover ${option.ticker}`}
                  onClick={() => removeTicker(option.ticker)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </span>
            ))}
            {displayedSelection.length === 0 && (
              <span className="text-sm text-muted-foreground">
                Nenhuma empresa selecionada
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
            <div className="min-w-32 text-sm text-muted-foreground md:text-right">
              {displayedSelection.length} de 5 empresas selecionadas
            </div>
            <Button
              type="button"
              onClick={compare}
              disabled={loading || displayedSelection.length < 2}
            >
              {loading ? "Comparando…" : "Comparar selecionadas"}
            </Button>
          </div>
          {loading && (
            <div
              role="status"
              aria-label="Carregando comparação das empresas"
              aria-busy="true"
              className="space-y-3 md:col-span-3"
            >
              <span className="sr-only">
                Consultando demonstrações oficiais da CVM…
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from(
                  { length: Math.max(displayedSelection.length, 2) },
                  (_, index) => (
                    <div key={index} className="rounded-lg border p-3">
                      <Skeleton className="h-4 w-24" />
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {Array.from({ length: 4 }, (_, metric) => (
                          <Skeleton key={metric} className="h-12 w-full" />
                        ))}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive md:col-span-3">
              {error}
            </p>
          )}
          {displayedSelection.length < 2 && !result && !error && (
            <p className="text-sm text-muted-foreground md:col-span-3">
              Selecione mais uma empresa para iniciar a comparação.
            </p>
          )}
        </CardContent>
      </Card>

      {result && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-0">
            <p className="text-sm text-muted-foreground">
              Setor CVM:{" "}
              <span className="font-semibold text-foreground">
                {result.sector ?? "não informado"}
              </span>
              {sectorMetadataDate && (
                <span className="ml-2 text-xs">
                  Cadastro CVM atualizado em {sectorMetadataDate}
                </span>
              )}
            </p>
            {rows.some((company) => company.selectedTickers.length > 1) && (
              <p role="status" className="text-sm text-muted-foreground">
                Classes do mesmo CNPJ foram agrupadas em uma única empresa.
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-180 border-collapse text-left text-sm">
                <caption className="sr-only">
                  Comparação de fundamentos e valuation por empresa, sem
                  classificação ou recomendação.
                </caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="min-w-36 p-3 font-medium">
                      Métrica
                    </th>
                    {rows.map((company) => (
                      <th
                        key={company.cnpj}
                        scope="col"
                        className="min-w-52 p-3 align-top"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <AssetLogo
                              ticker={company.ticker}
                              name={company.name}
                              logoUrl={company.logoUrl}
                              size="sm"
                            />
                            <p className="font-semibold">{company.ticker}</p>
                          </div>
                          <p className="font-normal text-muted-foreground">
                            {company.name}
                          </p>
                          <Link
                            className="inline-flex text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={`/analyses?ticker=${encodeURIComponent(company.ticker)}`}
                          >
                            Abrir análise individual
                          </Link>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["Fundamentos", "Valuation"] as const).map((group) => (
                    <Fragment key={group}>
                      <tr className="border-y bg-muted/70">
                        <th
                          scope="rowgroup"
                          colSpan={rows.length + 1}
                          className="p-3 font-semibold"
                        >
                          {group === "Valuation" ? "Valuation e preço" : group}
                        </th>
                      </tr>
                      {metricRows
                        .filter((row) => row.group === group)
                        .map((row) => (
                          <tr key={row.label} className="border-t">
                            <th
                              scope="row"
                              className="p-3 align-top font-medium"
                            >
                              {row.label}
                            </th>
                            {rows.map((company) => (
                              <td key={company.cnpj} className="p-3 align-top">
                                {renderCell(row.get(company), row.kind)}
                                {(row.key === "roe" ||
                                  row.key === "pe" ||
                                  row.key === "pb") && (
                                  <ComparisonCriterionStatus
                                    company={company}
                                    keyName={row.key}
                                    preferences={criteriaPreferences}
                                  />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td
                      colSpan={rows.length + 1}
                      className="p-3 text-xs text-muted-foreground"
                    >
                      Sem ranking, pontuação ou recomendação. A ordem segue a
                      seleção.
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
