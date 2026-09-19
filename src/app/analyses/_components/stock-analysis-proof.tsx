"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Analysis = {
  ticker: string;
  companyName: string | null;
  price: number | null;
  changePercent: number | null;
  history: Array<{ date: string; close: number }>;
  fundamentals: Array<{
    referenceDate: string;
    revenue: string | null;
    netIncome: string | null;
    equity: string | null;
  }>;
};
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const value = (number: string | null) =>
  number === null ? "—" : currency.format(Number(number));

function AnalysisSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid gap-4 lg:grid-cols-3"
    >
      <span className="sr-only">Carregando análise...</span>
      <Card className="lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-64" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function StockAnalysisProof() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryRemaining, setRetryRemaining] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      if (!response.ok) throw new Error(body.message);
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
    let active = true;
    fetch("/api/analyses/stocks/PETR4")
      .then(async (response) => {
        const body = await response.json();
        const retryAfter = Number(response.headers.get("retry-after"));
        if (
          response.status === 429 &&
          Number.isFinite(retryAfter) &&
          retryAfter > 0
        )
          setRetryRemaining(Math.ceil(retryAfter));
        if (!response.ok) throw new Error(body.message);
        return body as Analysis;
      })
      .then((data) => {
        if (active) setAnalysis(data);
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível consultar a ação agora. Tente novamente em instantes.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (retryRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setRetryRemaining((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [retryRemaining]);
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
            <RefreshCw />
            {retryRemaining > 0
              ? `Tente novamente em ${retryRemaining}s`
              : "Tentar novamente"}
          </Button>
        </CardContent>
      </Card>
    );
  if (!analysis) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardDescription>Ativo consultado</CardDescription>
          <CardTitle className="text-2xl">
            {analysis.ticker} ·{" "}
            {analysis.companyName ?? "Empresa não informada"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">
            {analysis.price === null ? "—" : currency.format(analysis.price)}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {analysis.changePercent === null
              ? "Variação não informada"
              : `Variação de ${analysis.changePercent.toFixed(2)}%`}{" "}
            · {analysis.history.length} preços históricos
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Dados de mercado</CardDescription>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Até um ano de cotações disponíveis.
          </p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Fundamentos anuais</CardTitle>
          <CardDescription>
            Demonstrativos oficiais disponíveis para o ativo consultado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.fundamentals.length ? (
            <div className="grid gap-3 md:grid-cols-3">
              {analysis.fundamentals.map((period) => (
                <div
                  key={period.referenceDate}
                  className="rounded-lg border bg-muted/30 p-4"
                >
                  <p className="text-sm font-medium">{period.referenceDate}</p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Receita</dt>
                      <dd>{value(period.revenue)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Lucro líquido</dt>
                      <dd>{value(period.netIncome)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Patrimônio</dt>
                      <dd>{value(period.equity)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem demonstrativo oficial disponível para este ativo no momento.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
