"use client";
import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
const number = (value: string | null) =>
  value === null ? "—" : currency.format(Number(value));
export function StockAnalysisProof() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/analyses/stocks/PETR4")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).message);
        return response.json() as Promise<Analysis>;
      })
      .then(setAnalysis)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consulta de ação</CardTitle>
        <CardDescription>
          Prova de conceito com PETR4; não inclui recomendação, valuation ou
          ranking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !analysis ? (
          <p className="text-sm text-muted-foreground">
            Carregando dados de mercado e demonstrativos oficiais…
          </p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="font-medium">
                {analysis.ticker} ·{" "}
                {analysis.companyName ?? "Empresa não informada"}
              </p>
              <p className="text-2xl font-semibold">
                {analysis.price === null
                  ? "—"
                  : currency.format(analysis.price)}
              </p>
              <p className="text-sm text-muted-foreground">
                Variação:{" "}
                {analysis.changePercent === null
                  ? "—"
                  : `${analysis.changePercent.toFixed(2)}%`}{" "}
                · {analysis.history.length} preços históricos
              </p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">
                Fundamentos anuais disponíveis
              </p>
              {analysis.fundamentals.length ? (
                <div className="space-y-2 text-sm">
                  {analysis.fundamentals.map((period) => (
                    <p key={period.referenceDate}>
                      {period.referenceDate}: receita {number(period.revenue)} ·
                      lucro líquido {number(period.netIncome)} · patrimônio{" "}
                      {number(period.equity)}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem demonstrativo oficial disponível para este ativo no
                  momento.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
