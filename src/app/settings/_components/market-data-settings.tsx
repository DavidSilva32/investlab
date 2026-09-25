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
  const [status, setStatus] = useState<MarketDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/settings/market-data", {
      cache: "no-store",
    });
    const body = (await response.json()) as MarketDataStatus & {
      message?: string;
    };
    if (!response.ok) throw new Error(body.message);
    setStatus(body);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/market-data", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as MarketDataStatus & {
          message?: string;
        };
        if (!response.ok) throw new Error(body.message);
        return body;
      })
      .then((body) => {
        if (!cancelled) setStatus(body);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Não foi possível consultar os dados de mercado.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setNotice("Preparando atualização dos dados de mercado.");
    let remaining = 1;
    let initialTotal: number | null = null;
    let updated = 0;
    let unavailable = 0;
    try {
      while (remaining > 0) {
        const response = await fetch("/api/screener/market/refresh", {
          method: "POST",
          cache: "no-store",
        });
        const body = (await response.json()) as {
          message?: string;
          remainingIssuers?: number;
          totalStaleIssuers?: number;
          updatedIssuers?: number;
          unavailableIssuers?: number;
          attemptedIssuers?: number;
        };
        if (!response.ok)
          throw new Error(
            body.message ?? "A atualização de mercado não foi concluída.",
          );
        initialTotal ??= body.totalStaleIssuers ?? 0;
        updated += body.updatedIssuers ?? 0;
        unavailable += body.unavailableIssuers ?? 0;
        remaining = body.remainingIssuers ?? 0;
        setNotice(
          `Atualizando dados de mercado: ${initialTotal - remaining} de ${initialTotal} emissores.`,
        );
        if (remaining > 0 && (body.attemptedIssuers ?? 0) === 0)
          throw new Error(
            "A atualização não avançou. Tente novamente mais tarde.",
          );
      }
      await loadStatus();
      const unavailableSummary =
        unavailable === 1
          ? "; 1 emissor indisponível"
          : unavailable > 1
            ? `; ${number.format(unavailable)} emissores indisponíveis`
            : "";
      setNotice(
        `Mercado atualizado: ${number.format(updated)} emissores com cotação validada${unavailableSummary}.`,
      );
    } catch (refreshError) {
      setError(
        refreshError instanceof Error && refreshError.message
          ? refreshError.message
          : "Não foi possível atualizar os dados de mercado.",
      );
      try {
        await loadStatus();
      } catch {
        /* Mantém a falha da atualização como mensagem principal. */
      }
    } finally {
      setRefreshing(false);
    }
  }

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
          <Button
            onClick={() => void refresh()}
            disabled={refreshing || loading}
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {refreshing ? "Atualizando…" : "Atualizar mercado"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="text-sm text-emerald-700 dark:text-emerald-400"
          >
            {notice}
          </p>
        )}
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Consultando a última atualização do mercado…
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Icon
                className={`size-4 ${run?.status === "COMPLETED" ? "text-emerald-600" : run?.status === "PARTIAL" ? "text-amber-600" : "text-muted-foreground"} ${run?.status === "RUNNING" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Status da última execução: {label}</span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Cotação mais recente registrada
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {status?.latestQuote
                    ? `${dateTime.format(new Date(status.latestQuote.quoteObservedAt))} (${ageLabel(status.latestQuote.quoteObservedAt)})`
                    : "Sem cotação registrada"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Ticker da observação
                </dt>
                <dd className="mt-1 text-sm font-medium">
                  {status?.latestQuote?.sourceTicker ?? "—"}
                </dd>
              </div>
              {run && (
                <>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Última execução
                    </dt>
                    <dd className="mt-1 text-sm font-medium">
                      {dateTime.format(new Date(run.startedAt))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Emissores tentados
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {number.format(run.attemptedIssuers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Atualizados
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {number.format(run.updatedIssuers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Indisponíveis
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">
                      {number.format(run.unavailableIssuers)}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <p className="text-xs text-muted-foreground">
              As múltiplas do Screener só usam cotações verificadas com até sete
              dias. Atualize quando a observação ultrapassar essa janela; isso é
              uma regra do cálculo atual, não uma garantia de cobertura de todos
              os ativos.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
