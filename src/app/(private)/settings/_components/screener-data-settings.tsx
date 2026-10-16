"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  Clock3,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getApiMessage } from "@/lib/api-message";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

type SyncStatus = {
  lastSuccessfulCompletedAt: string | null;
  hasSuccessfulSync: boolean;
  latestRun: null | {
    status: "RUNNING" | "COMPLETED" | "FAILED";
    startedAt: string;
    completedAt: string | null;
    durationMs: number;
    issuerCount: number | null;
    securityCount: number | null;
    factCount: number | null;
    errorMessage: string | null;
  };
};
const statusErrorFallback =
  "Não foi possível consultar o status da sincronização.";

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
function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes} min ${remainingSeconds} s`
    : `${remainingSeconds} s`;
}

export function ScreenerDataSettings() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.screener(),
    queryFn: () =>
      apiRequest<SyncStatus>(
        "/api/settings/screener",
        { cache: "no-store" },
        statusErrorFallback,
      ),
  });
  const status = statusQuery.data ?? null;
  const loading = statusQuery.isPending;
  const [syncing, setSyncing] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState(() => Date.now());
  const [syncCurrentTime, setSyncCurrentTime] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    const result = await statusQuery.refetch();
    if (result.error) setError(result.error.message);
  }, [statusQuery]);

  useEffect(() => {
    if (!syncing) return;
    const interval = window.setInterval(() => {
      setSyncCurrentTime(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [syncing]);

  async function synchronize() {
    const startedAt = Date.now();
    setSyncStartedAt(startedAt);
    setSyncCurrentTime(startedAt);
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/screener/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        toast.error(
          getApiMessage(
            body,
            "A sincronização não foi concluída. Consulte o status abaixo.",
          ),
        );
        return;
      }
      toast.success(
        getApiMessage(body, "Sincronização concluída com sucesso."),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.analyses.all,
      });
    } catch {
      toast.error(
        "A sincronização não foi concluída. Consulte o status abaixo.",
      );
    } finally {
      await loadStatus();
      setSyncing(false);
    }
  }

  const run = status?.latestRun;
  const runLabel = !run
    ? "Ainda não executada"
    : run.status === "RUNNING"
      ? "Em andamento"
      : run.status === "COMPLETED"
        ? "Concluída"
        : "Falhou";
  const StatusIcon = !run
    ? Clock3
    : run.status === "RUNNING"
      ? RefreshCw
      : run.status === "COMPLETED"
        ? CheckCircle2
        : XCircle;
  const synchronizeButton = (
    <Button
      className="w-full shrink-0 sm:w-auto"
      onClick={() => void synchronize()}
      disabled={syncing || loading}
    >
      <RefreshCw
        className={`size-4 ${syncing ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {syncing ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Fundamentos e cadastro</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Mantém atualizados os emissores, tickers e demonstrativos anuais
              da CVM usados nas análises.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || statusQuery.error) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error ?? statusQuery.error!.message}</span>
          </div>
        )}
        {syncing && (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              Sincronização iniciada.
            </p>
            <p aria-live="off" className="text-sm text-muted-foreground">
              Tempo decorrido:{" "}
              {formatDuration(Math.max(0, syncCurrentTime - syncStartedAt))}.
            </p>
          </>
        )}
        {loading && !status ? (
          <div
            role="status"
            aria-label="Carregando status da base de empresas"
            aria-busy="true"
            className="space-y-4"
          >
            <span className="sr-only">Consultando a última sincronização…</span>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
              {synchronizeButton}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <StatusIcon
                  className={`size-4 ${run?.status === "COMPLETED" ? "text-status-success" : run?.status === "FAILED" ? "text-status-danger" : "text-muted-foreground"} ${run?.status === "RUNNING" ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>Status: {runLabel}</span>
              </div>
              {run && (
                <p className="text-sm text-muted-foreground">
                  Última atualização concluída:{" "}
                  {status?.lastSuccessfulCompletedAt
                    ? `${dateTime.format(new Date(status.lastSuccessfulCompletedAt))} (${ageLabel(status.lastSuccessfulCompletedAt)})`
                    : "nenhuma sincronização concluída"}
                </p>
              )}
              {synchronizeButton}
            </div>
            {run ? (
              <>
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
                          Iniciada em
                        </dt>
                        <dd className="min-w-0 text-sm font-medium">
                          {dateTime.format(new Date(run.startedAt))}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                        <dt className="text-xs text-muted-foreground">
                          Duração
                        </dt>
                        <dd className="min-w-0 text-sm font-medium">
                          {formatDuration(run.durationMs)}
                        </dd>
                      </div>
                      {(
                        [
                          { label: "Emissores", value: run.issuerCount },
                          { label: "Tickers", value: run.securityCount },
                          {
                            label: "Fatos financeiros",
                            value: run.factCount,
                          },
                        ] as const
                      ).map(({ label, value }) => (
                        <div
                          key={label}
                          className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4"
                        >
                          <dt className="text-xs text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="min-w-0 text-sm font-medium tabular-nums">
                            {value === null ? "—" : number.format(value)}
                          </dd>
                        </div>
                      ))}
                      {run.errorMessage && (
                        <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4">
                          <dt className="text-xs text-muted-foreground">
                            Mensagem
                          </dt>
                          <dd className="min-w-0 break-words text-sm text-destructive">
                            {run.errorMessage}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="space-y-2 border-t pt-3">
                      <p className="leading-relaxed">
                        A CVM prevê prazo de até três meses após o encerramento
                        do exercício para entrega da DFP. A publicação pode
                        ocorrer depois dessa janela.{" "}
                        <a
                          className="underline underline-offset-4"
                          href="https://www.gov.br/cvm/pt-br/assuntos-regulados/envio-de-informacoes-a-cvm-calendario"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Calendário de entrega da CVM
                        </a>
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Os dados ainda não foram sincronizados. Inicie a primeira carga
                para habilitar o Screener.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
