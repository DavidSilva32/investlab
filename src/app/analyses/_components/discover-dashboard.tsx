"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  DiscoveryAssessment,
  ScreenerResult,
} from "@/backend/services/screener-metrics";

type DiscoveryCompany = Omit<ScreenerResult, "metrics"> & {
  assessment: DiscoveryAssessment;
};
type Payload = { results: DiscoveryCompany[]; hasSuccessfulSync: boolean };

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const percentage = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});
const availability = {
  available: "Evidências disponíveis",
  unavailable: "Indisponível",
} as const;

function money(value: number | null) {
  return value === null ? "Indisponível" : currency.format(value);
}
function percent(value: number | null) {
  return value === null ? "Indisponível" : `${percentage.format(value)}%`;
}
function periodLabel(value: string | null) {
  return value
    ? date.format(new Date(`${value}T00:00:00Z`))
    : "período indisponível";
}
export function DiscoverDashboard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/screener/discover", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Payload & { message?: string };
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Não foi possível carregar empresas para estudo agora.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <Card role="alert" className="border-destructive/40">
        <CardContent className="space-y-3 pt-6 text-sm">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" asChild>
            <Link href="/settings">Consultar atualização dos dados</Link>
          </Button>
        </CardContent>
      </Card>
    );

  if (!payload)
    return (
      <Card aria-busy="true">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Carregando empresas e evidências anuais…
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Empresas para estudo</CardTitle>
          <CardDescription>
            Consulte primeiro o que merece atenção e aprofunde nas evidências e
            na metodologia. A análise organiza dados históricos; não classifica
            empresas como boas ou ruins nem recomenda investimentos.
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {payload.results.length} empresas · ordem alfabética
      </p>

      {!payload.hasSuccessfulSync ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-medium">A base ainda não foi sincronizada.</p>
            <p className="text-sm text-muted-foreground">
              Consulte Configurações para acompanhar e iniciar a atualização dos
              dados.
            </p>
            <Button variant="outline" asChild>
              <Link href="/settings">Abrir Configurações</Link>
            </Button>
          </CardContent>
        </Card>
      ) : payload.results.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma empresa está disponível na base para este estudo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payload.results.map((company) => (
            <Card key={company.cnpj}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">{company.name}</CardTitle>
                    <CardDescription>
                      {company.sector ?? "Setor não informado"} · CVM{" "}
                      {company.cvmCode}
                    </CardDescription>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    aria-label={`Ações de ${company.name}`}
                  >
                    {company.securities.map(({ ticker }) => (
                      <Button key={ticker} variant="outline" size="sm" asChild>
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
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Fonte: {company.assessment.source}
                  {company.assessment.period
                    ? ` · Exercício encerrado em ${date.format(new Date(`${company.assessment.period}T00:00:00Z`))}`
                    : " · Período comparável indisponível"}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {company.assessment.dimensions.map((dimension) => (
                    <li key={dimension.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{dimension.label}</p>
                        <Badge
                          variant={
                            dimension.status === "available"
                              ? "default"
                              : "outline"
                          }
                        >
                          {availability[dimension.status]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {dimension.explanation}
                      </p>
                    </li>
                  ))}
                </ul>
                <Collapsible className="group text-sm">
                  <CollapsibleTrigger className="flex w-fit cursor-pointer items-center gap-1 rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    Ver evidências anuais e metodologia
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 space-y-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Janela inicial de até cinco exercícios completos.
                        Valores ausentes ou períodos incompatíveis aparecem como
                        indisponíveis. ROIC, diluição e estrutura financeira não
                        integram esta versão; instituições financeiras ficam
                        fora da metodologia.
                      </p>
                      {company.assessment.evidence.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Não há exercícios completos comparáveis disponíveis.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {company.assessment.evidence.map((point) => (
                            <li
                              key={point.year}
                              className="rounded-md bg-muted/40 p-3 text-xs"
                            >
                              <p className="font-medium">
                                Exercício {point.year}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                Receita {money(point.revenue)} ·{" "}
                                {periodLabel(point.revenuePeriod)}
                                <br />
                                Lucro {money(point.netIncome)} ·{" "}
                                {periodLabel(point.netIncomePeriod)}
                                <br />
                                Margem {percent(point.netMargin)} · ROE{" "}
                                {percent(point.roe)}
                              </p>
                              <p className="mt-1 text-muted-foreground">
                                Patrimônio {money(point.equity)} ·{" "}
                                {periodLabel(point.equityPeriod)}
                                <br />
                                Caixa operacional{" "}
                                {money(point.operatingCashFlow)} ·{" "}
                                {periodLabel(point.operatingCashFlowPeriod)}
                              </p>{" "}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
