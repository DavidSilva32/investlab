"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type MarketDataStatus = {
  latestQuote: { quoteObservedAt: string; sourceTicker: string } | null;
  latestRun: null | {
    status: "RUNNING" | "COMPLETED" | "PARTIAL";
    startedAt: string;
    completedAt: string | null;
    attemptedIssuers: number;
    updatedIssuers: number;
    unavailableIssuers: number;
    skippedFreshIssuers: number;
  };
};
const statusErrorFallback = "Não foi possível consultar os dados de mercado.";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const number = new Intl.NumberFormat("pt-BR");

function ageLabel(value: string) {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  return days === 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export function MarketDataSettings() {
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.marketData(),
    queryFn: () =>
      apiRequest<MarketDataStatus>(
        "/api/settings/market-data",
        { cache: "no-store" },
        statusErrorFallback,
      ),
  });
  const status = statusQuery.data ?? null;
  const loading = statusQuery.isPending;
  const run = status?.latestRun;
  const label = !run
    ? "Ainda não executada"
    : run.status === "RUNNING"
      ? "Em andamento"
      : run.status === "COMPLETED"
        ? "Concluída"
        : "Parcial";
  const Icon = !run
    ? Clock3
    : run.status === "RUNNING"
      ? RefreshCw
      : run.status === "COMPLETED"
        ? CheckCircle2
        : XCircle;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Dados de mercado</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Cotações BRAPI são observações de mercado com data própria,
              independentes da sincronização anual da CVM.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {statusQuery.error && (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{statusQuery.error.message}</span>
          </div>
        )}
        {loading ? (
          <div
            role="status"
            aria-label="Carregando status do mercado"
            aria-busy="true"
            className="space-y-4"
          >
            <span className="sr-only">
              Consultando a última atualização do mercado…
            </span>
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid min-w-0 gap-2 sm:flex-1 sm:grid-cols-2 sm:items-center">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Icon
                    className={`size-4 ${run?.status === "COMPLETED" ? "text-status-success" : run?.status === "PARTIAL" ? "text-status-warning" : "text-muted-foreground"} ${run?.status === "RUNNING" ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>Status da última execução: {label}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cotação mais recente registrada:{" "}
                  {status?.latestQuote
                    ? `${dateTime.format(new Date(status.latestQuote.quoteObservedAt))} (${ageLabel(status.latestQuote.quoteObservedAt)})`
                    : "nenhuma cotação registrada"}
                </p>
              </div>
            </div>
            <Collapsible className="rounded-lg border p-3 text-xs text-muted-foreground">
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border-b pb-3 text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Detalhes técnicos
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-4">
                <dl className="grid gap-2">
                  <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                    <dt className="text-xs text-muted-foreground">
                      Ticker da observação
                    </dt>
                    <dd className="min-w-0 text-sm font-medium">
                      {status?.latestQuote?.sourceTicker ?? "—"}
                    </dd>
                  </div>
                  {run && (
                    <>
                      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                        <dt className="text-xs text-muted-foreground">
                          Última execução
                        </dt>
                        <dd className="min-w-0 text-sm font-medium">
                          {dateTime.format(new Date(run.startedAt))}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                        <dt className="text-xs text-muted-foreground">
                          Emissores tentados
                        </dt>
                        <dd className="min-w-0 text-sm font-medium tabular-nums">
                          {number.format(run.attemptedIssuers)}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                        <dt className="text-xs text-muted-foreground">
                          Atualizados
                        </dt>
                        <dd className="min-w-0 text-sm font-medium tabular-nums">
                          {number.format(run.updatedIssuers)}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                        <dt className="text-xs text-muted-foreground">
                          Indisponíveis
                        </dt>
                        <dd className="min-w-0 text-sm font-medium tabular-nums">
                          {number.format(run.unavailableIssuers)}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
                <p className="border-t pt-3 leading-relaxed">
                  As múltiplas do Screener só usam cotações verificadas com até
                  sete dias. Essa regra não garante cobertura de todos os
                  ativos.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
}
