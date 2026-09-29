"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AddStudyListButton } from "@/components/study-list-add-button";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { StockValuationPanel } from "./stock-valuation-panel";
import type { StockAnalysis } from "./stock-analysis-types";

type TickerOption = { ticker: string; name: string };
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
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
  initialTicker = "PETR4",
}: {
  initialTicker?: string;
}) {
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [selectedTicker, setSelectedTicker] = useState(initialTicker);
  const requestSequence = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryRemaining, setRetryRemaining] = useState(0);
  const [days, setDays] = useState(365);

  const load = useCallback(async (ticker: string, notify = false) => {
    const sequence = ++requestSequence.current;
    const toastId = "stock-analysis-load";
    if (notify)
      toast.loading(`Consultando dados de ${ticker}...`, { id: toastId });
    setLoading(true);
    setError(null);
    setRetryRemaining(0);
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
      if (!response.ok) throw new Error();
      setAnalysis(body as StockAnalysis);
      if (notify)
        toast.success(`Dados de ${ticker} carregados com sucesso.`, {
          id: toastId,
        });
    } catch {
      if (sequence !== requestSequence.current) return;
      setAnalysis(null);
      if (notify)
        toast.error("Não foi possível carregar os dados da ação.", {
          id: toastId,
        });
      setError(
        "Não foi possível consultar a ação agora. Tente novamente em instantes.",
      );
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(initialTicker), 0);
    return () => window.clearTimeout(timer);
  }, [initialTicker, load]);

  useEffect(() => {
    function handlePopState() {
      if (window.location.pathname !== "/analyses") return;
      const queryTicker = new URLSearchParams(window.location.search).get(
        "ticker",
      );
      const ticker = queryTicker?.match(/^[A-Za-z]{4}[0-9]{1,2}$/)
        ? queryTicker.toUpperCase()
        : "PETR4";
      setSelectedTicker(ticker);
      setDays(365);
      void load(ticker);
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
    <AnalysisStockSearch
      key={selectedTicker}
      ticker={selectedTicker}
      onSelect={selectTicker}
    />
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
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
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
  if (!analysis) return search;

  const annual = analysis.fundamentals.filter(
    (period) => period.sourceDocument === "DFP",
  );
  const interim = analysis.fundamentals.filter(
    (period) => period.sourceDocument === "ITR",
  );
  const intervals = historyIntervals.filter(({ days }) =>
    hasPeriodCoverage(history, days),
  );

  return (
    <div className="space-y-4">
      {search}
      <Card>
        <CardHeader>
          <CardDescription>Ativo consultado</CardDescription>
          <CardTitle className="text-2xl">
            {analysis.ticker} ·{" "}
            {analysis.companyName ?? "Empresa não informada"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
          <p className="text-3xl font-semibold tracking-tight">
            {analysis.price === null ? "—" : money.format(analysis.price)}
          </p>
          <p
            className={
              analysis.changePercent !== null && analysis.changePercent < 0
                ? "text-sm font-medium text-destructive"
                : "text-sm font-medium text-emerald-600 dark:text-emerald-400"
            }
          >
            {analysis.changePercent === null
              ? "Variação do dia não informada"
              : `Variação do dia: ${analysis.changePercent.toFixed(2)}%`}
          </p>
          <div className="sm:ml-auto">
            <AddStudyListButton
              issuerCnpj={analysis.cnpj}
              companyName={analysis.companyName ?? analysis.ticker}
              ticker={analysis.ticker}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de preço</CardTitle>
          <CardDescription>
            Cotações diárias em ordem cronológica. Selecione um intervalo
            disponível.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {intervals.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
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
          <PriceHistoryChart points={points} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Indicadores fundamentalistas</CardTitle>
          <CardDescription>
            P/L e P/VP usam o valor de mercado da BRAPI e as demonstrações
            financeiras anuais mais recentes; os demais preservam a base
            indicada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {analysis.indicators.map((indicator) => (
            <FundamentalIndicatorCard
              key={indicator.key}
              indicator={indicator}
            />
          ))}
        </CardContent>
      </Card>
      <StockValuationPanel ticker={analysis.ticker} />
      <Card>
        <CardHeader>
          <CardTitle>Evolução dos fundamentos anuais</CardTitle>
          <CardDescription>
            Comparação entre exercícios encerrados. Os demonstrativos
            intermediários aparecem separadamente abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FundamentalsEvolution periods={annual} />
          <FundamentalsGrid periods={annual} type="DFP" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Demonstrativos intermediários</CardTitle>
          <CardDescription>
            Informações trimestrais acumuladas no exercício até cada data; não
            representam trimestres isolados nem devem ser comparadas diretamente
            às demonstrações financeiras anuais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FundamentalsGrid periods={interim} type="ITR" />
        </CardContent>
      </Card>
    </div>
  );
}
