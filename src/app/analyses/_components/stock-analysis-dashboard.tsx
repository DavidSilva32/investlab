"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, Search, RefreshCw, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { getLearningClassHref } from "@/lib/asset-class-learning";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnalysisSkeleton } from "./analysis-skeleton";
import { AnalysisStockSearch } from "./analysis-stock-search";
import { FundamentalIndicatorCard } from "./fundamental-indicator-card";
import { FundamentalsEvolution } from "./fundamentals-evolution";
import { FundamentalsGrid } from "./fundamentals-grid";
import { PriceHistoryChart } from "./price-history-chart";
import { StockAnalysisReading } from "./stock-analysis-reading";
import {
  annualAnalysisPeriods,
  type StockAnalysis,
} from "./stock-analysis-types";

type TickerOption = { ticker: string; name: string };
const recentTickersKey = "investlab:analyses:recent-tickers";
const recentTickerLimit = 5;

function readRecentTickers(): TickerOption[] {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(recentTickersKey) ?? "[]",
    );
    if (!Array.isArray(stored)) return [];
    return stored
      .filter(
        (item): item is TickerOption =>
          typeof item === "object" &&
          item !== null &&
          "ticker" in item &&
          typeof item.ticker === "string" &&
          /^[A-Z]{4}[0-9]{1,2}$/.test(item.ticker) &&
          "name" in item &&
          typeof item.name === "string",
      )
      .slice(0, recentTickerLimit);
  } catch {
    return [];
  }
}

function saveRecentTicker(option: TickerOption) {
  try {
    const recent = [
      option,
      ...readRecentTickers().filter((item) => item.ticker !== option.ticker),
    ].slice(0, recentTickerLimit);
    window.localStorage.setItem(recentTickersKey, JSON.stringify(recent));
  } catch {
    // Recent tickers are a convenience and must not interrupt an analysis.
  }
}
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const pricePercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 2,
});
const historyIntervals = [
  { days: 30, label: "1 mês" },
  { days: 90, label: "3 meses" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano" },
  { days: 1825, label: "5 anos" },
];
const marketClosureToleranceDays = 7;

function periodStart(latestDate: string, days: number) {
  const start = new Date(`${latestDate}T00:00:00Z`);
  const years = days === 365 ? 1 : days === 1825 ? 5 : null;
  if (years) {
    const targetYear = start.getUTCFullYear() - years;
    const month = start.getUTCMonth();
    const lastDay = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate();
    start.setUTCFullYear(
      targetYear,
      month,
      Math.min(start.getUTCDate(), lastDay),
    );
  } else {
    start.setUTCDate(start.getUTCDate() - days);
  }
  return start;
}

function hasPeriodCoverage(history: StockAnalysis["history"], days: number) {
  if (history.length < 2) return false;
  const oldest = new Date(`${history[0].date}T00:00:00Z`).getTime();
  const coverageDeadline = periodStart(history.at(-1)!.date, days);
  coverageDeadline.setUTCDate(
    coverageDeadline.getUTCDate() + marketClosureToleranceDays,
  );
  return oldest <= coverageDeadline.getTime();
}

export function StockAnalysisDashboard({
  initialTicker = "",
}: {
  initialTicker?: string;
}) {
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [recentTickers, setRecentTickers] = useState<TickerOption[]>([]);
  const [selectedTicker, setSelectedTicker] = useState(initialTicker);
  const requestSequence = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [showErrorInline, setShowErrorInline] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialTicker));
  const [retryRemaining, setRetryRemaining] = useState(0);
  const [days, setDays] = useState(365);

  const load = useCallback(async (ticker: string, notify = false) => {
    const sequence = ++requestSequence.current;
    const toastId = "stock-analysis-load";
    if (notify)
      toast.loading(`Consultando dados de ${ticker}...`, { id: toastId });
    setLoading(true);
    setError(null);
    setShowErrorInline(false);
    setRetryRemaining(0);
    let failureMessage =
      "Não foi possível consultar a ação agora. Tente novamente em instantes.";
    try {
      const response = await fetch(
        `/api/analyses/stocks/${encodeURIComponent(ticker)}`,
      );
      const body = await response.json();
      const retryAfter = Number(response.headers.get("retry-after"));
      if (sequence !== requestSequence.current) return;
      if (
        response.status === 429 &&
        Number.isFinite(retryAfter) &&
        retryAfter > 0
      )
        setRetryRemaining(Math.ceil(retryAfter));
      if (!response.ok) {
        failureMessage = getApiMessage(
          body,
          "Não foi possível consultar a ação agora. Tente novamente em instantes.",
        );
        throw new Error("API request failed");
      }
      if (body) {
        const loadedAnalysis = body as StockAnalysis;
        setAnalysis(loadedAnalysis);
        saveRecentTicker({
          ticker: ticker.toUpperCase(),
          name: loadedAnalysis.companyName ?? ticker.toUpperCase(),
        });
        setRecentTickers(readRecentTickers());
      } else {
        setAnalysis(null);
      }
      if (notify)
        toast.success(
          getApiMessage(body, `Dados de ${ticker} carregados com sucesso.`),
          {
            id: toastId,
          },
        );
    } catch {
      if (sequence !== requestSequence.current) return;
      setAnalysis(null);
      if (notify) toast.error(failureMessage, { id: toastId });
      setError(failureMessage);
      setShowErrorInline(!notify);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTicker) return;
    const timer = window.setTimeout(() => void load(initialTicker), 0);
    return () => window.clearTimeout(timer);
  }, [initialTicker, load]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setRecentTickers(readRecentTickers()),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handlePopState() {
      if (window.location.pathname !== "/analyses") return;
      const queryTicker = new URLSearchParams(window.location.search).get(
        "ticker",
      );
      const ticker = queryTicker?.match(/^[A-Za-z]{4}[0-9]{1,2}$/)
        ? queryTicker.toUpperCase()
        : "";
      setSelectedTicker(ticker);
      setDays(365);
      if (ticker) {
        void load(ticker);
      } else {
        requestSequence.current += 1;
        setAnalysis(null);
        setError(null);
        setLoading(false);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [load]);

  useEffect(() => {
    if (retryRemaining <= 0) return;
    const timer = window.setInterval(
      () => setRetryRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retryRemaining]);

  const selectTicker = useCallback(
    (option: TickerOption) => {
      const ticker = option.ticker.toUpperCase();
      setSelectedTicker(ticker);
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", ticker);
      window.history.pushState({}, "", url);
      setDays(365);
      void load(ticker, true);
    },
    [load],
  );

  const history = useMemo(
    () =>
      (analysis?.history ?? [])
        .slice()
        .sort((left, right) => left.date.localeCompare(right.date)),
    [analysis],
  );
  const points = useMemo(() => {
    const latest = history.at(-1);
    if (!latest) return [];
    const from = periodStart(latest.date, days);
    return history.filter(
      (point) => new Date(`${point.date}T00:00:00Z`) >= from,
    );
  }, [days, history]);

  const search = (
    <AnalysisStockSearch ticker={selectedTicker} onSelect={selectTicker} />
  );
  if (loading)
    return (
      <div className="space-y-4">
        {search}
        <AnalysisSkeleton />
      </div>
    );
  if (error)
    return (
      <div className="space-y-4">
        {search}
        <Card>
          <CardHeader>
            <CardTitle>Consulta de ação</CardTitle>
            <CardDescription>
              Os dados de mercado podem ficar indisponíveis temporariamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {showErrorInline && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={retryRemaining > 0}
              onClick={() => void load(selectedTicker, true)}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {retryRemaining > 0
                ? `Tente novamente em ${retryRemaining}s`
                : "Tentar novamente"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  if (!analysis)
    return (
      <div className="space-y-5">
        {search}
        {recentTickers.length > 0 && (
          <section
            aria-labelledby="recent-analyses-title"
            className="space-y-2"
          >
            <h2
              id="recent-analyses-title"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <Clock3
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              Consultadas recentemente
            </h2>
            <div className="flex flex-wrap gap-2">
              {recentTickers.map((option) => (
                <Button
                  key={option.ticker}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => selectTicker(option)}
                  aria-label={`Retomar análise de ${option.ticker}`}
                >
                  <span className="font-semibold tabular-nums">
                    {option.ticker}
                  </span>
                  <span className="max-w-40 truncate text-muted-foreground">
                    {option.name}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        )}
        <Card className="border-dashed">
          <CardContent className="flex min-h-44 flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-medium">
                Encontre uma empresa para analisar
              </h2>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Pesquise pelo ticker ou nome para ver a cotação, o histórico de
                preço e os dados financeiros disponíveis.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  const annual = annualAnalysisPeriods(analysis.fundamentals);
  const interim = analysis.fundamentals.filter(
    (period) =>
      period.sourceDocument === "ITR" &&
      period.periodBasis === "year_to_date" &&
      !period.isDerived,
  );
  const discreteQuarters = analysis.fundamentals.filter(
    (period) =>
      period.sourceDocument === "ITR" &&
      period.periodBasis === "quarterly" &&
      period.exerciseOrder !== "previous",
  );
  const intervals = historyIntervals.filter(({ days }) =>
    hasPeriodCoverage(history, days),
  );
  const selectedIntervalLabel = historyIntervals.find(
    (interval) => interval.days === days,
  )!.label;
  const firstVisiblePrice = points[0]?.close;
  const lastVisiblePrice = points.at(-1)?.close;
  const priceChange =
    intervals.some((interval) => interval.days === days) &&
    points.length >= 2 &&
    Number.isFinite(firstVisiblePrice) &&
    Number.isFinite(lastVisiblePrice) &&
    firstVisiblePrice! > 0
      ? (lastVisiblePrice! - firstVisiblePrice!) / firstVisiblePrice!
      : null;
  const priceChangeTone =
    priceChange === null || priceChange === 0
      ? "text-muted-foreground"
      : priceChange > 0
        ? "text-status-success"
        : "text-status-danger";

  return (
    <div className="space-y-4">
      {search}
      <Card>
        <CardContent className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)] sm:items-center sm:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ativo consultado
              </p>
              <Link
                href={getLearningClassHref("brazilian_equities")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <BookOpen aria-hidden="true" className="size-3.5" />
                Aprender sobre Ações e BDRs
              </Link>
            </div>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl">
              {analysis.ticker} ·{" "}
              {analysis.companyName ?? "Empresa não informada"}
            </h2>
            <div className="mt-2">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {analysis.price === null ? "—" : money.format(analysis.price)}
              </p>
              <p className="text-xs text-muted-foreground">
                {analysis.changePercent === null
                  ? "Variação do dia não informada"
                  : `Variação do dia: ${analysis.changePercent.toFixed(2)}%`}
              </p>
              <p className="text-xs text-muted-foreground">
                {analysis.priceUpdatedAt &&
                Number.isFinite(Date.parse(analysis.priceUpdatedAt))
                  ? `${analysis.priceIsStale ? "Última cotação observada; não representa cotação atual" : "Cotação observada"} em ${new Intl.DateTimeFormat(
                      "pt-BR",
                      {
                        dateStyle: "short",
                        timeStyle: "short",
                      },
                    ).format(new Date(analysis.priceUpdatedAt))}`
                  : "Data da cotação não informada"}
              </p>
            </div>
          </div>
          <div className="min-w-0 sm:border-l sm:pl-6">
            <p className="text-xs text-muted-foreground">
              Variação do preço no período · {selectedIntervalLabel}
            </p>
            <p
              className={`mt-0.5 text-lg font-semibold tabular-nums ${priceChangeTone}`}
            >
              {priceChange === null
                ? "Indisponível"
                : pricePercent.format(priceChange)}
            </p>
            <p className="text-xs text-muted-foreground">Sem dividendos</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Cotação histórica</CardTitle>
            <CardDescription>
              Preços de fechamento em reais. Selecione um período disponível.
            </CardDescription>
          </div>
          {intervals.length > 0 && (
            <div
              className="flex flex-wrap gap-2 sm:justify-end"
              role="group"
              aria-label="Intervalo do histórico"
            >
              {intervals.map((interval) => (
                <Button
                  key={interval.days}
                  type="button"
                  size="sm"
                  variant={interval.days === days ? "default" : "outline"}
                  aria-pressed={interval.days === days}
                  onClick={() => setDays(interval.days)}
                >
                  {interval.label}
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <PriceHistoryChart
            points={points}
            unavailable={analysis.historyStatus === "unavailable"}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Indicadores fundamentalistas</CardTitle>
          <CardDescription>
            Indicadores disponíveis e uma síntese dos dados anuais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {analysis.fundamentalsIsStale && analysis.fundamentalsFetchedAt && (
            <p
              role="status"
              className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-muted-foreground"
            >
              Não foi possível obter os demonstrativos mais recentes. Exibimos
              os últimos dados validados, obtidos em{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(analysis.fundamentalsFetchedAt))}
              . Os períodos de referência permanecem os informados pela CVM.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {analysis.indicators.map((indicator) => (
              <FundamentalIndicatorCard
                key={indicator.key}
                indicator={indicator}
              />
            ))}
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-medium">Leitura do InvestLab</h3>
            <StockAnalysisReading periods={annual} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evolução dos fundamentos financeiros</CardTitle>
          <CardDescription>
            Compare a evolução da receita, do lucro líquido e do patrimônio
            líquido nos períodos informados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FundamentalsEvolution periods={analysis.fundamentals} />
        </CardContent>
      </Card>
      <Collapsible>
        <Card>
          <CardHeader className="pb-3">
            <div>
              <h2 className="font-semibold leading-none tracking-tight">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto justify-between gap-3 p-0 text-left hover:bg-transparent"
                  >
                    <span>Ver demonstrativos e detalhes técnicos</span>
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </h2>
              <CardDescription className="mt-1">
                Valores anuais e informações trimestrais acumuladas.
              </CardDescription>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              <section
                aria-labelledby="annual-evidence-title"
                className="space-y-3"
              >
                <h3 id="annual-evidence-title" className="font-medium">
                  Períodos anuais
                </h3>
                <FundamentalsGrid periods={annual} type="DFP" />
              </section>
              <section
                aria-labelledby="interim-evidence-title"
                className="space-y-3"
              >
                <div>
                  <h3 id="interim-evidence-title" className="font-medium">
                    Períodos intermediários
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Valores acumulados no exercício até cada data; não
                    representam trimestres isolados nem devem ser comparados
                    diretamente com os exercícios anuais.
                  </p>
                </div>
                <FundamentalsGrid periods={interim} type="ITR" />
              </section>
              {discreteQuarters.length > 0 && (
                <section
                  aria-labelledby="quarterly-evidence-title"
                  className="space-y-3"
                >
                  <div>
                    <h3 id="quarterly-evidence-title" className="font-medium">
                      Trimestres isolados informados
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Estes valores cobrem apenas o trimestre indicado; os
                      demonstrativos intermediários acumulados permanecem em uma
                      seção separada.
                    </p>
                  </div>
                  <FundamentalsGrid periods={discreteQuarters} type="ITR" />
                </section>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
