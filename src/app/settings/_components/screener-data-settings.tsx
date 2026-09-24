"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
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

type SyncStatus = {
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

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const number = new Intl.NumberFormat("pt-BR");

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
  const [syncElapsedSeconds, setSyncElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const getStatus = useCallback(async () => {
    const response = await fetch("/api/settings/screener", {
      cache: "no-store",
    });
    const body = (await response.json()) as SyncStatus & {
      message?: string;
    };
    if (!response.ok) throw new Error(body.message);
    return body;
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getStatus());
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "Não foi possível consultar o status da sincronização.",
      );
    } finally {
      setLoading(false);
    }
  }, [getStatus]);

  useEffect(() => {
    if (!syncing) return;
    const interval = window.setInterval(() => {
      setSyncElapsedSeconds((elapsed) => elapsed + 1);
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
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Não foi possível consultar o status da sincronização.",
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
    let syncErrorMessage: string | null = null;
    setSyncElapsedSeconds(0);
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/screener/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message);
      setNotice("Sincronização concluída com sucesso.");
    } catch (syncError) {
      syncErrorMessage =
        syncError instanceof Error && syncError.message
          ? syncError.message
          : "A sincronização não foi concluída. Consulte o status abaixo.";
      setError(syncErrorMessage);
    } finally {
      await loadStatus();
      if (syncErrorMessage) setError(syncErrorMessage);
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
            <CardTitle>Dados do Screener</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">
              Acompanhe a carga local de emissores, tickers e fatos financeiros.
              A sincronização pode levar alguns minutos.
            </CardDescription>
          </div>
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
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            Sincronização em andamento há{" "}
            {formatDuration(syncElapsedSeconds * 1000)}.
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="text-sm text-emerald-700 dark:text-emerald-400"
          >
            {notice}
          </p>
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
                    <dt className="text-xs text-muted-foreground">Duração</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {formatDuration(run.durationMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Emissores</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {run.issuerCount === null
                        ? "—"
                        : number.format(run.issuerCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Tickers</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {run.securityCount === null
                        ? "—"
                        : number.format(run.securityCount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Fatos financeiros
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {run.factCount === null
                        ? "—"
                        : number.format(run.factCount)}
                    </dd>
                  </div>
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
