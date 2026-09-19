"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleHelp, RefreshCw } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

type Period = {
  referenceDate: string;
  sourceDocument: "DFP" | "ITR";
  revenue: string | null;
  netIncome: string | null;
  equity: string | null;
};
type Indicator = {
  key: "pe" | "pb" | "roe" | "netMargin";
  value: number | null;
  unavailableReason: string | null;
  referenceDate: string | null;
  sourceDocument: "DFP" | "ITR" | null;
};
type Analysis = {
  ticker: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  history: { date: string; close: number }[];
  fundamentals: Period[];
  indicators: Indicator[];
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const monthLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const chartConfig = {
  close: { label: "Fechamento", color: "var(--chart-2)" },
} satisfies ChartConfig;
const indicatorNames: Record<Indicator["key"], string> = {
  pe: "P/L",
  pb: "P/VP",
  roe: "ROE",
  netMargin: "Margem líquida",
};
const indicatorHelp: Record<Indicator["key"], string> = {
  pe: "P/L compara o valor de mercado ao lucro líquido do último DFP anual. É exibido em vezes, não em percentual.",
  pb: "P/VP compara o valor de mercado ao patrimônio líquido do último DFP anual. É exibido em vezes, não em percentual.",
  roe: "ROE mede o lucro líquido anual sobre o patrimônio líquido médio de dois DFPs anuais consecutivos.",
  netMargin:
    "Margem líquida divide o lucro líquido pela receita do mesmo demonstrativo. Itens não recorrentes podem alterar a leitura.",
};

function AnalysisSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Carregando análise...</span>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-56" />
        </CardHeader>
        <CardContent className="flex gap-6">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-6 w-28" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function PriceChart({ points }: { points: Analysis["history"] }) {
  if (points.length < 2)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Não há histórico suficiente para montar o gráfico neste intervalo.
      </div>
    );

  return (
    <ChartContainer
      config={chartConfig}
      className="h-64 w-full aspect-auto"
      aria-label="Gráfico do histórico de preço de fechamento"
    >
      <LineChart
        accessibilityLayer
        data={points}
        margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tickFormatter={monthLabel}
        />
        <YAxis
          dataKey="close"
          tickLine={false}
          axisLine={false}
          width={68}
          tickFormatter={(value: number) => money.format(value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(value) =>
                typeof value === "string" ? dateLabel(value) : ""
              }
              formatter={(value) => money.format(Number(value))}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="close"
          stroke="var(--color-close)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

function IndicatorCard({ indicator }: { indicator: Indicator }) {
  const usesRatio = indicator.key === "pe" || indicator.key === "pb";
  const value =
    indicator.value === null
      ? "Indisponível"
      : `${indicator.value.toFixed(1)}${usesRatio ? "x" : "%"}`;
  const reference = indicator.referenceDate
    ? `${indicator.sourceDocument === "ITR" ? "Acumulado até" : "DFP anual encerrado em"} ${dateLabel(indicator.referenceDate)}`
    : indicator.unavailableReason;

  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm transition-shadow motion-safe:hover:shadow-md">
      <div className="flex items-center gap-1.5">
        <h3 className="font-medium">{indicatorNames[indicator.key]}</h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Ajuda sobre ${indicatorNames[indicator.key]}`}
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="max-w-xs text-sm leading-relaxed"
            align="start"
          >
            {indicatorHelp[indicator.key]}
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
        {reference}
      </p>
    </article>
  );
}

function FundamentalsGrid({
  periods,
  type,
}: {
  periods: Period[];
  type: "DFP" | "ITR";
}) {
  if (!periods.length)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {type === "DFP" ? "Sem DFP anual disponível." : "Sem ITR disponível."}
      </div>
    );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((period) => (
        <article
          key={`${period.sourceDocument}-${period.referenceDate}`}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <h3 className="font-medium">
            {type === "ITR" ? "Acumulado até " : ""}
            {dateLabel(period.referenceDate)}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Receita</dt>
              <dd className="font-medium tabular-nums">
                {period.revenue === null
                  ? "—"
                  : compact.format(Number(period.revenue))}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Lucro líquido</dt>
              <dd className="font-medium tabular-nums">
                {period.netIncome === null
                  ? "—"
                  : compact.format(Number(period.netIncome))}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Patrimônio</dt>
              <dd className="font-medium tabular-nums">
                {period.equity === null
                  ? "—"
                  : compact.format(Number(period.equity))}
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function StockAnalysisDashboard() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryRemaining, setRetryRemaining] = useState(0);
  const [days, setDays] = useState(365);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRetryRemaining(0);
    try {
      const response = await fetch("/api/analyses/stocks/PETR4");
      const body = await response.json();
      const retryAfter = Number(response.headers.get("retry-after"));
      if (
        response.status === 429 &&
        Number.isFinite(retryAfter) &&
        retryAfter > 0
      )
        setRetryRemaining(Math.ceil(retryAfter));
      if (!response.ok) throw new Error();
      setAnalysis(body as Analysis);
    } catch {
      setAnalysis(null);
      setError(
        "Não foi possível consultar a ação agora. Tente novamente em instantes.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (retryRemaining <= 0) return;
    const timer = window.setInterval(
      () => setRetryRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retryRemaining]);

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
    const from = new Date(`${latest.date}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - days);
    return history.filter(
      (point) => new Date(`${point.date}T00:00:00Z`) >= from,
    );
  }, [days, history]);

  if (loading) return <AnalysisSkeleton />;
  if (error)
    return (
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
            onClick={() => void load()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {retryRemaining > 0
              ? `Tente novamente em ${retryRemaining}s`
              : "Tentar novamente"}
          </Button>
        </CardContent>
      </Card>
    );
  if (!analysis) return null;

  const annual = analysis.fundamentals.filter(
    (period) => period.sourceDocument === "DFP",
  );
  const interim = analysis.fundamentals.filter(
    (period) => period.sourceDocument === "ITR",
  );
  const intervals = [30, 90, 180, 365].filter((interval) => {
    if (history.length < 2) return false;
    return (
      new Date(`${history.at(-1)?.date}T00:00:00Z`).getTime() -
        new Date(`${history[0].date}T00:00:00Z`).getTime() >=
      (interval - 1) * 86400000
    );
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>Ativo consultado</CardDescription>
          <CardTitle className="text-2xl">
            {analysis.ticker} ·{" "}
            {analysis.companyName ?? "Empresa não informada"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-8">
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
              ? "Variação não informada"
              : `Variação: ${analysis.changePercent.toFixed(2)}%`}
          </p>
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
              aria-label="Intervalo do histórico"
            >
              {intervals.map((interval) => (
                <Button
                  key={interval}
                  type="button"
                  size="sm"
                  variant={interval === days ? "default" : "outline"}
                  onClick={() => setDays(interval)}
                >
                  {interval === 365
                    ? "1 ano"
                    : interval === 30
                      ? "1 mês"
                      : `${Math.round(interval / 30)} meses`}
                </Button>
              ))}
            </div>
          )}
          <PriceChart points={points} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Indicadores fundamentalistas</CardTitle>
          <CardDescription>
            Os múltiplos usam valor de mercado da BRAPI e o último DFP anual
            compatível; os demais preservam a base indicada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {analysis.indicators.map((indicator) => (
            <IndicatorCard key={indicator.key} indicator={indicator} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Evolução dos fundamentos anuais</CardTitle>
          <CardDescription>
            DFPs anuais comparados entre si: receita, lucro líquido e patrimônio
            líquido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FundamentalsGrid periods={annual} type="DFP" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Demonstrativos intermediários</CardTitle>
          <CardDescription>
            ITRs acumulados no exercício até cada data; não representam
            trimestres isolados nem devem ser comparados diretamente aos DFPs
            anuais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FundamentalsGrid periods={interim} type="ITR" />
        </CardContent>
      </Card>
    </div>
  );
}
