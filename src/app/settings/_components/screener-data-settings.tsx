"use client";

import { useCallback, useEffect, useState } from "react";
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
class ApiResponseError extends Error {}
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
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStartedAt, setSyncStartedAt] = useState(() => Date.now());
  const [syncCurrentTime, setSyncCurrentTime] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const getStatus = useCallback(async () => {
    const response = await fetch("/api/settings/screener", {
      cache: "no-store",
    });
    const body = (await response.json()) as SyncStatus & {
      message?: string;
    };
    if (!response.ok)
      throw new ApiResponseError(getApiMessage(body, statusErrorFallback));
    return body;
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getStatus());
    } catch (loadError) {
      setError(
        loadError instanceof ApiResponseError && loadError.message
          ? loadError.message
          : statusErrorFallback,
      );
    } finally {
      setLoading(false);
    }
  }, [getStatus]);

  useEffect(() => {
    if (!syncing) return;
    const interval = window.setInterval(() => {
      setSyncCurrentTime(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [syncing]);

  useEffect(() => {
    let cancelled = false;
    void getStatus()
      .then((body) => {
        if (!cancelled) setStatus(body);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof ApiResponseError && loadError.message
              ? loadError.message
              : statusErrorFallback,
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getStatus]);

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
          {!status?.hasSuccessfulSync && (
            <Button
              onClick={() => void synchronize()}
              disabled={syncing || loading}
            >
              <RefreshCw
                className={`size-4 ${syncing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {syncing ? "Sincronizando…" : "Sincronizar agora"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
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
          <p role="status" className="text-sm text-muted-foreground">
            Consultando a última sincronização…
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <StatusIcon
                className={`size-4 ${run?.status === "COMPLETED" ? "text-emerald-600" : run?.status === "FAILED" ? "text-destructive" : "text-muted-foreground"} ${run?.status === "RUNNING" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Status: {runLabel}</span>
            </div>
            {run ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Última atualização concluída:{" "}
                  {status?.lastSuccessfulCompletedAt
                    ? `${dateTime.format(new Date(status.lastSuccessfulCompletedAt))} (${ageLabel(status.lastSuccessfulCompletedAt)})`
                    : "nenhuma sincronização concluída"}
                </p>
                <Collapsible className="text-xs text-muted-foreground">
                  <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-1 rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    Detalhes técnicos
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-4">
                    {status?.hasSuccessfulSync && (
                      <Button
                        onClick={() => void synchronize()}
                        disabled={syncing || loading}
                      >
                        <RefreshCw
                          className={`size-4 ${syncing ? "animate-spin" : ""}`}
                          aria-hidden="true"
                        />
                        {syncing ? "Sincronizando…" : "Sincronizar agora"}
                      </Button>
                    )}
                    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Iniciada em
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
                          {dateTime.format(new Date(run.startedAt))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          Duração
                        </dt>
                        <dd className="mt-1 text-sm font-medium">
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
                        <div key={label}>
                          <dt className="text-xs text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="mt-1 text-sm font-medium tabular-nums">
                            {value === null ? "—" : number.format(value)}
                          </dd>
                        </div>
                      ))}
                      {run.errorMessage && (
                        <div className="sm:col-span-2 lg:col-span-4">
                          <dt className="text-xs text-muted-foreground">
                            Mensagem
                          </dt>
                          <dd className="mt-1 text-sm text-destructive">
                            {run.errorMessage}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="space-y-2">
                      <p>
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
