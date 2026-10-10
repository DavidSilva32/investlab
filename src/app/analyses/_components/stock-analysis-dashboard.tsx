"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, ChevronDown, Search, RefreshCw, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiRequest, apiRequestWithResponse } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
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
import { FundamentalsEvolution } from "./fundamentals-evolution";
import { FundamentalsGrid } from "./fundamentals-grid";
import { PriceHistoryChart } from "./price-history-chart";
import { StockAnalysisReading } from "./stock-analysis-reading";
import { StockCriteriaSummary } from "./stock-criteria-summary";
import {
  annualAnalysisPeriods,
  type StockAnalysis,
} from "./stock-analysis-types";

type TickerOption = { ticker: string; name: string };
const recentTickersKey = "investlab:analyses:recent-tickers";
const recentTickersUpdatedEvent = "investlab:analyses:recent-tickers-updated";
const recentTickerLimit = 5;
const emptyRecentTickers: TickerOption[] = [];
let recentTickersSnapshot: TickerOption[] | null = null;
let recentTickersStorageValue: string | null | undefined;

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
    recentTickersStorageValue = JSON.stringify(recent);
    recentTickersSnapshot = recent;
    window.dispatchEvent(new Event(recentTickersUpdatedEvent));
  } catch {
    // Recent tickers are a convenience and must not interrupt an analysis.
  }
}

function subscribeToRecentTickers(onStoreChange: () => void) {
  const refresh = () => {
    recentTickersStorageValue = window.localStorage.getItem(recentTickersKey);
    recentTickersSnapshot = readRecentTickers();
    onStoreChange();
  };
  window.addEventListener(recentTickersUpdatedEvent, refresh);
  window.addEventListener("storage", refresh);
  return () => {
    window.removeEventListener(recentTickersUpdatedEvent, refresh);
    window.removeEventListener("storage", refresh);
  };
}

function getRecentTickersSnapshot() {
  try {
    const storageValue = window.localStorage.getItem(recentTickersKey);
    if (storageValue !== recentTickersStorageValue) {
      recentTickersStorageValue = storageValue;
      recentTickersSnapshot = readRecentTickers();
    }
  } catch {
    recentTickersStorageValue = null;
    recentTickersSnapshot = emptyRecentTickers;
  }
  recentTickersSnapshot ??= readRecentTickers();
  return recentTickersSnapshot;
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

function retryAfterSeconds(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt)
    ? 0
    : Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

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
  const recentTickers = useSyncExternalStore(
    subscribeToRecentTickers,
    getRecentTickersSnapshot,
    () => emptyRecentTickers,
  );
  const [selectedTicker, setSelectedTicker] = useState(initialTicker);
  const [notifiedTicker, setNotifiedTicker] = useState<string | null>(null);
  const pendingNotification = useRef<string | null>(null);
  const [clockNow, setClockNow] = useState(0);
  const automaticHistoryRetries = useRef(new Set<string>());
  const automaticHistoryRetryTimer = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [days, setDays] = useState(365);
  const analysisQuery = useQuery({
    queryKey: queryKeys.analyses.stock(selectedTicker.toUpperCase()),
    enabled: Boolean(selectedTicker),
    queryFn: async () => {
      const { data } = await apiRequestWithResponse<StockAnalysis>(
        `/api/analyses/stocks/${encodeURIComponent(selectedTicker)}`,
        undefined,
        "Não foi possível consultar a ação agora. Tente novamente em instantes.",
      );
      return data;
    },
  });
  const historyRetryQuery = useQuery({
    queryKey: queryKeys.analyses.stockHistory(selectedTicker.toUpperCase()),
    enabled: false,
    queryFn: () =>
      apiRequest<
        Pick<
          StockAnalysis,
          "ticker" | "history" | "historyStatus" | "historyFailure"
        >
      >(
        `/api/analyses/stocks/${encodeURIComponent(selectedTicker)}/history`,
        undefined,
        "Não foi possível atualizar o histórico agora.",
      ),
  });
  const refetchHistory = historyRetryQuery.refetch;
  const analysis = selectedTicker ? (analysisQuery.data ?? null) : null;
  const error =
    !analysis && analysisQuery.error instanceof Error
      ? analysisQuery.error.message
      : null;
  const showErrorInline = notifiedTicker !== selectedTicker;
  const loading = Boolean(selectedTicker) && analysisQuery.isPending;
  const retryAfter =
    analysisQuery.error instanceof ApiError &&
    analysisQuery.error.status === 429
      ? Number(analysisQuery.error.retryAfter)
      : 0;
  const retryStartedAt = analysisQuery.errorUpdatedAt;
  const retryRemaining =
    Number.isFinite(retryAfter) && retryAfter > 0 && retryStartedAt > 0
      ? Math.max(
          0,
          Math.ceil(
            retryAfter - ((clockNow || retryStartedAt) - retryStartedAt) / 1000,
          ),
        )
      : 0;
  const historyFailure =
    historyRetryQuery.data?.historyFailure ?? analysis?.historyFailure;
  const historyRetryHttpError =
    historyRetryQuery.error instanceof ApiError &&
    historyRetryQuery.error.status === 429
      ? historyRetryQuery.error
      : null;
  const historyRetryAfter = historyRetryHttpError
    ? retryAfterSeconds(historyRetryHttpError.retryAfter)
    : historyFailure?.reason === "rate_limited"
      ? (historyFailure.retryAfterSeconds ?? 0)
      : 0;
  const historyRetryStartedAt = historyRetryHttpError
    ? historyRetryQuery.errorUpdatedAt
    : historyRetryQuery.data
      ? historyRetryQuery.dataUpdatedAt
      : analysisQuery.dataUpdatedAt;
  const historyRetryRemaining =
    Number.isFinite(historyRetryAfter) &&
    historyRetryAfter > 0 &&
    historyRetryStartedAt > 0
      ? Math.max(
          0,
          Math.ceil(
            historyRetryAfter -
              ((clockNow || historyRetryStartedAt) - historyRetryStartedAt) /
                1000,
          ),
        )
      : 0;

  const load = useCallback(
    (ticker: string) => {
      toast.loading(`Consultando dados de ${ticker}...`, {
        id: "stock-analysis-load",
      });
      pendingNotification.current = ticker;
      setSelectedTicker(ticker);
      setNotifiedTicker(ticker);
      if (ticker === selectedTicker) void analysisQuery.refetch();
    },
    [analysisQuery, selectedTicker],
  );

  useEffect(() => {
    const loadedAnalysis = analysisQuery.data;
    if (!loadedAnalysis) return;
    saveRecentTicker({
      ticker: loadedAnalysis.ticker.toUpperCase(),
      name: loadedAnalysis.companyName ?? loadedAnalysis.ticker.toUpperCase(),
    });
    if (pendingNotification.current === loadedAnalysis.ticker) {
      toast.success(
        `Dados de ${loadedAnalysis.ticker} carregados com sucesso.`,
        {
          id: "stock-analysis-load",
        },
      );
      pendingNotification.current = null;
    }
  }, [analysisQuery.data]);

  useEffect(() => {
    const queryError = analysisQuery.error;
    if (!queryError) return;
    if (pendingNotification.current === selectedTicker) {
      toast.error(queryError.message, { id: "stock-analysis-load" });
      pendingNotification.current = null;
    }
  }, [analysisQuery.error, analysisQuery.errorUpdatedAt, selectedTicker]);

  useEffect(() => {
    if (
      (!retryAfter || !retryStartedAt) &&
      (!historyRetryAfter || !historyRetryStartedAt)
    )
      return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter, retryStartedAt, historyRetryAfter, historyRetryStartedAt]);

  useEffect(() => {
    const currentAnalysis = analysisQuery.data;
    const ticker = selectedTicker.toUpperCase();
    const failure = currentAnalysis?.historyFailure;
    if (
      !ticker ||
      !currentAnalysis ||
      currentAnalysis.ticker.toUpperCase() !== ticker ||
      currentAnalysis.historyStatus !== "unavailable" ||
      !failure ||
      automaticHistoryRetries.current.has(ticker)
    )
      return;

    const retryDelayMs =
      failure.reason === "timeout" || failure.reason === "provider_error"
        ? 1_000
        : failure.reason === "rate_limited" &&
            Number.isFinite(failure.retryAfterSeconds) &&
            failure.retryAfterSeconds! <= 300
          ? Math.max(1_000, failure.retryAfterSeconds! * 1_000)
          : null;
    if (retryDelayMs === null) return;

    automaticHistoryRetryTimer.current = setTimeout(() => {
      automaticHistoryRetryTimer.current = null;
      automaticHistoryRetries.current.add(ticker);
      void refetchHistory();
    }, retryDelayMs);

    return () => {
      if (automaticHistoryRetryTimer.current)
        clearTimeout(automaticHistoryRetryTimer.current);
      automaticHistoryRetryTimer.current = null;
    };
  }, [analysisQuery.data, refetchHistory, selectedTicker]);

  const retryHistoryManually = useCallback(() => {
    const ticker = selectedTicker.toUpperCase();
    automaticHistoryRetries.current.add(ticker);
    if (automaticHistoryRetryTimer.current)
      clearTimeout(automaticHistoryRetryTimer.current);
    automaticHistoryRetryTimer.current = null;
    void refetchHistory();
  }, [refetchHistory, selectedTicker]);

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
      setNotifiedTicker(null);
      pendingNotification.current = null;
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const selectTicker = useCallback(
    (option: TickerOption) => {
      const ticker = option.ticker.toUpperCase();
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", ticker);
      window.history.pushState({}, "", url);
      setDays(365);
      void load(ticker);
    },
    [load],
  );

  const history = useMemo(
    () =>
      (historyRetryQuery.data?.history ?? analysis?.history ?? [])
        .slice()
        .sort((left, right) => left.date.localeCompare(right.date)),
    [analysis, historyRetryQuery.data],
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
              onClick={() => void load(selectedTicker)}
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
            <p className="text-xs text-muted-foreground">
              Não inclui dividendos
            </p>
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
            status={
              historyRetryQuery.data?.historyStatus ??
              analysis.historyStatus ??
              "unavailable"
            }
            failure={historyFailure}
            retrying={historyRetryQuery.isFetching}
            retryError={historyRetryQuery.error instanceof Error}
            retryAfterSeconds={historyRetryRemaining}
            onRetry={retryHistoryManually}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-5 py-5">
          <StockCriteriaSummary analysis={analysis} />
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-medium">O que os dados mostram</h3>
            <StockAnalysisReading periods={annual} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Como os números mudaram nos últimos cinco anos</CardTitle>
          <CardDescription>
            Receita, lucro e patrimônio da empresa em cada ano disponível.
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
                    <span>Ver dados detalhados</span>
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                      aria-hidden="true"
                    />
                  </Button>
                </CollapsibleTrigger>
              </h2>
              <CardDescription className="mt-1">
                Resultados por período, origem dos dados e como os números são
                calculados.
              </CardDescription>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              <section
                aria-labelledby="analysis-data-origin-title"
                className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm"
              >
                <h3 id="analysis-data-origin-title" className="font-medium">
                  De onde vêm estes dados
                </h3>
                <p className="text-muted-foreground">
                  Os dados financeiros vêm de relatórios públicos das empresas,
                  consultados na Comissão de Valores Mobiliários. As cotações
                  vêm de uma fonte de dados do mercado. As datas mostram a que
                  período cada valor se refere.
                </p>
                <p className="text-muted-foreground">
                  A variação do preço não inclui dividendos e não representa o
                  retorno total do investimento. Valores ausentes não são
                  tratados como zero.
                </p>
              </section>
              <section
                aria-labelledby="annual-evidence-title"
                className="space-y-3"
              >
                <h3 id="annual-evidence-title" className="font-medium">
                  Resultados anuais
                </h3>
                <FundamentalsGrid periods={annual} type="DFP" />
              </section>
              <section
                aria-labelledby="interim-evidence-title"
                className="space-y-3"
              >
                <div>
                  <h3 id="interim-evidence-title" className="font-medium">
                    Atualizações durante o ano
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Mostra o total desde o começo do ano até a data indicada.
                    Para comparar anos completos, use os resultados anuais.
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
                      Resultados de cada trimestre
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Cada valor considera somente o trimestre indicado. Os
                      valores acumulados no ano aparecem na seção anterior.
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
