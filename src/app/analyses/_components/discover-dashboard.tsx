"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
const criterionLabels = {
  met: "Atendido",
  not_met: "Não atendido",
  unavailable: "Indisponível",
} as const;
const badgeVariants = {
  met: "default",
  not_met: "secondary",
  unavailable: "outline",
} as const;

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
          Carregando empresas e critérios da metodologia…
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Empresas para estudar</CardTitle>
          <CardDescription>
            Esta metodologia observa lucro anual, patrimônio e continuidade em
            demonstrações consolidadas da CVM. Ela organiza evidências para
            análise; não classifica empresas como boas ou ruins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A janela de cinco exercícios é uma regra explícita de observação de
            histórico, não uma previsão de desempenho. Setores sem conceitos
            contábeis validados aparecem como indisponíveis.
          </p>
          <p>
            A empresa entra no universo por vínculo exato entre CNPJ e cadastro
            da CVM. Os critérios abaixo mostram o que os dados anuais sustentam.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Empresas para estudo</h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {payload.results.length} empresas · ordem alfabética
        </p>
      </div>

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
                  {company.assessment.criteria.map((criterion) => (
                    <li key={criterion.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{criterion.label}</p>
                        <Badge variant={badgeVariants[criterion.status]}>
                          {criterionLabels[criterion.status]}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {criterion.explanation}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
