"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ScreenerResult = {
  cnpj: string;
  cvmCode: string;
  name: string;
  sector: string | null;
  quantitativeEligible: boolean;
  securities: { ticker: string; name: string }[];
  metrics: {
    latestNetIncome: number | null;
    latestEquity: number | null;
    roe: number | null;
    netMargin: number | null;
    pe: number | null;
    pb: number | null;
    valuationMarketDate: string | null;
    valuationFinancialDate: string | null;
    valuationSourceTicker: string | null;
  };
};

export type ScreenerCoverage = {
  withNetIncome: number;
  withEquity: number;
  withRoe: number;
  withNetMargin: number;
  withPe: number;
  withPb: number;
};

const pageSize = 12;
const ratio = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">
        {value === null ? "—" : ratio.format(value) + (suffix ?? "")}
      </dd>
    </div>
  );
}

export function ScreenerResultsList({
  results,
  counts,
}: {
  results: ScreenerResult[];
  counts: ScreenerCoverage;
}) {
  const [pagination, setPagination] = useState({ results, page: 1 });
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const visiblePage = Math.min(
    pagination.results === results ? pagination.page : 1,
    totalPages,
  );
  const firstIndex = (visiblePage - 1) * pageSize;
  const pageResults = results.slice(firstIndex, firstIndex + pageSize);
  const firstResult = results.length === 0 ? 0 : firstIndex + 1;
  const lastResult = Math.min(visiblePage * pageSize, results.length);

  return (
    <section aria-label="Resultados do Screener" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cobertura dos fundamentos</CardTitle>
          <CardDescription>
            Os fundamentos dependem de setor validado e fatos financeiros
            compatíveis. P/L e P/VP também exigem preço recente validado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Dados disponíveis: lucro {counts.withNetIncome}, patrimônio{" "}
            {counts.withEquity}, ROE {counts.withRoe}, margem{" "}
            {counts.withNetMargin}, P/L {counts.withPe} e P/VP {counts.withPb}.
          </p>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Mostrando {firstResult}–{lastResult} de {results.length}
          </p>
          <div className="space-y-3">
            {pageResults.map((company) => (
              <Card key={company.cnpj}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {company.name}
                      </CardTitle>
                      <CardDescription>
                        CVM {company.cvmCode}
                        {company.sector ? ` · ${company.sector}` : ""}
                      </CardDescription>
                      {company.quantitativeEligible === false && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Fundamentos quantitativos indisponíveis para este
                          setor.
                        </p>
                      )}
                    </div>
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label={`Tickers de ${company.name}`}
                    >
                      {company.securities.map(({ ticker }) => (
                        <Button
                          key={ticker}
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link
                            href={`/analyses?ticker=${encodeURIComponent(ticker)}`}
                          >
                            {ticker} · Analisar
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    <Metric
                      label="Lucro líquido"
                      value={company.metrics.latestNetIncome}
                    />
                    <Metric
                      label="Patrimônio líquido"
                      value={company.metrics.latestEquity}
                    />
                    <Metric
                      label="ROE"
                      value={company.metrics.roe}
                      suffix="%"
                    />
                    <Metric
                      label="Margem líquida"
                      value={company.metrics.netMargin}
                      suffix="%"
                    />
                    <Metric label="P/L" value={company.metrics.pe} />
                    <Metric label="P/VP" value={company.metrics.pb} />
                  </dl>
                  {company.metrics.valuationMarketDate &&
                    company.metrics.valuationFinancialDate && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Base das múltiplas: BRAPI{" "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(
                          new Date(company.metrics.valuationMarketDate),
                        )}
                        {` (${company.metrics.valuationSourceTicker})`}
                        {" · DFP "}
                        {new Intl.DateTimeFormat("pt-BR", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        }).format(
                          new Date(company.metrics.valuationFinancialDate),
                        )}
                      </p>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
          {totalPages > 1 && (
            <nav
              aria-label="Paginação dos resultados"
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Página anterior"
                onClick={() =>
                  setPagination({ results, page: visiblePage - 1 })
                }
                disabled={visiblePage === 1}
              >
                <ChevronLeft aria-hidden="true" />
                Anterior
              </Button>
              <span aria-live="off" className="text-sm text-muted-foreground">
                Página {visiblePage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Próxima página"
                onClick={() =>
                  setPagination({ results, page: visiblePage + 1 })
                }
                disabled={visiblePage === totalPages}
              >
                Próxima
                <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
