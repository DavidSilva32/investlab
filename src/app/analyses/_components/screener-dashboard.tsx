"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, Filter, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ScreenerResultsList,
  type ScreenerResult,
  type ScreenerCoverage,
} from "@/app/analyses/_components/screener-results-list";

type Filters = {
  positiveProfitYears?: number;
  equityPositive?: boolean;
  minimumRoe?: number;
  minimumNetMargin?: number;
  maximumPe?: number;
  maximumPb?: number;
};
type Counts = {
  issuers: number;
  withNetIncome: number;
  withEquity: number;
  withRoe: number;
  withNetMargin: number;
  withPe: number;
  withPb: number;
};
type Payload = {
  results: ScreenerResult[];
  counts: Counts & ScreenerCoverage;
  hasSuccessfulSync: boolean;
};

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) params.set(key, String(value));
  return params.toString();
}

export function ScreenerDashboard() {
  const [draft, setDraft] = useState<Filters>({});
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingMarket, setRefreshingMarket] = useState(false);
  const [marketRefreshMessage, setMarketRefreshMessage] = useState<
    string | null
  >(null);

  const load = useCallback(async (filters: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery(filters);
      const response = await fetch(`/api/screener${query ? `?${query}` : ""}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      setPayload((await response.json()) as Payload);
    } catch {
      setError(
        "Não foi possível consultar a base sincronizada. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitialResults() {
      try {
        const response = await fetch("/api/screener", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as Payload;
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled)
          setError(
            "Não foi possível consultar a base sincronizada. Tente novamente.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitialResults();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshMarket() {
    setRefreshingMarket(true);
    setError(null);
    setMarketRefreshMessage("Preparando atualização dos dados de mercado.");
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
        const payload = (await response.json()) as {
          message?: string;
          remainingIssuers?: number;
          totalStaleIssuers?: number;
          updatedIssuers?: number;
          unavailableIssuers?: number;
          attemptedIssuers?: number;
        };
        if (!response.ok)
          throw new Error(
            payload.message ?? "A atualização de mercado não foi concluída.",
          );
        initialTotal ??= payload.totalStaleIssuers ?? 0;
        updated += payload.updatedIssuers ?? 0;
        unavailable += payload.unavailableIssuers ?? 0;
        remaining = payload.remainingIssuers ?? 0;
        const processed = initialTotal - remaining;
        setMarketRefreshMessage(
          `Atualizando dados de mercado: ${processed} de ${initialTotal} emissores.`,
        );
        if (remaining > 0 && (payload.attemptedIssuers ?? 0) === 0)
          throw new Error(
            "A atualização não avançou. Tente novamente mais tarde.",
          );
      }
      const unavailableSummary =
        unavailable === 1
          ? "; 1 emissor indisponível"
          : unavailable > 1
            ? `; ${unavailable} emissores indisponíveis`
            : "";
      setMarketRefreshMessage(
        `Mercado atualizado: ${updated} emissores válidos${unavailableSummary}.`,
      );
      await load(draft);
    } catch (refreshError) {
      await load(draft);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Não foi possível atualizar os dados de mercado agora.",
      );
    } finally {
      setRefreshingMarket(false);
    }
  }
  function updateNumber(
    key:
      | "positiveProfitYears"
      | "minimumRoe"
      | "minimumNetMargin"
      | "maximumPe"
      | "maximumPb",
    value: string,
  ) {
    setDraft((current) => {
      const number = value.trim() === "" ? undefined : Number(value);
      if (key === "positiveProfitYears")
        return { ...current, positiveProfitYears: number };
      if (key === "minimumRoe") return { ...current, minimumRoe: number };
      if (key === "minimumNetMargin")
        return { ...current, minimumNetMargin: number };
      if (key === "maximumPe") return { ...current, maximumPe: number };
      return { ...current, maximumPb: number };
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(draft);
  }

  function reset() {
    setDraft({});
    void load({});
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Dados de mercado</p>
          <p className="text-xs text-muted-foreground">
            Atualização separada dos filtros; cotações válidas ficam em cache
            por até 7 dias.
          </p>
          {marketRefreshMessage && (
            <p
              className="mt-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {marketRefreshMessage}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshMarket()}
          disabled={refreshingMarket || loading}
        >
          <RefreshCw
            className={`size-4 ${refreshingMarket ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {refreshingMarket ? "Atualizando mercado" : "Atualizar mercado"}
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Filter className="size-5" aria-hidden="true" />
            </div>
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>
                Explore fundamentos anuais consolidados já sincronizados. Os
                filtros podem ser combinados.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2 text-sm font-medium">
                Lucro positivo nos últimos N exercícios
                <Input
                  aria-label="Lucro positivo nos últimos N exercícios"
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={draft.positiveProfitYears ?? ""}
                  onChange={(event) =>
                    updateNumber("positiveProfitYears", event.target.value)
                  }
                  placeholder="Sem filtro"
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
                <input
                  aria-label="Patrimônio líquido positivo"
                  type="checkbox"
                  checked={draft.equityPositive === true}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      equityPositive: event.target.checked || undefined,
                    }))
                  }
                  className="size-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                Patrimônio líquido positivo
              </label>
              <label className="space-y-2 text-sm font-medium">
                ROE mínimo (%)
                <Input
                  aria-label="ROE mínimo (%)"
                  type="number"
                  step="any"
                  value={draft.minimumRoe ?? ""}
                  onChange={(event) =>
                    updateNumber("minimumRoe", event.target.value)
                  }
                  placeholder="Sem filtro"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Margem líquida mínima (%)
                <Input
                  aria-label="Margem líquida mínima (%)"
                  type="number"
                  step="any"
                  value={draft.minimumNetMargin ?? ""}
                  onChange={(event) =>
                    updateNumber("minimumNetMargin", event.target.value)
                  }
                  placeholder="Sem filtro"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                P/L máximo
                <Input
                  aria-label="P/L máximo"
                  type="number"
                  step="any"
                  value={draft.maximumPe ?? ""}
                  onChange={(event) =>
                    updateNumber("maximumPe", event.target.value)
                  }
                  placeholder="Sem base válida"
                />
                {(payload?.counts.withPe ?? 0) === 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Atualize os dados de mercado para aplicar o filtro.
                  </span>
                )}
              </label>
              <label className="space-y-2 text-sm font-medium">
                P/VP máximo
                <Input
                  aria-label="P/VP máximo"
                  type="number"
                  step="any"
                  value={draft.maximumPb ?? ""}
                  onChange={(event) =>
                    updateNumber("maximumPb", event.target.value)
                  }
                  placeholder="Sem base válida"
                />
                {(payload?.counts.withPb ?? 0) === 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Atualize os dados de mercado para aplicar o filtro.
                  </span>
                )}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                <Search className="size-4" aria-hidden="true" />
                Aplicar filtros
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={reset}
              >
                Limpar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Empresas encontradas</h2>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {payload
            ? payload.hasSuccessfulSync
              ? String(payload.results.length) +
                " de " +
                String(payload.counts.issuers) +
                " emissores"
              : "Aguardando primeira sincronização"
            : "Carregando"}
        </p>
      </div>

      {error && (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="flex items-center gap-3 pt-6 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load(draft)}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card aria-busy="true">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Consultando dados locais do screener…
          </CardContent>
        </Card>
      )}

      {!loading && !error && payload?.results.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            {!payload.hasSuccessfulSync ? (
              <>
                <p className="font-medium">
                  Dados do Screener ainda não sincronizados.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Consulte Configurações para iniciar a sincronização dos dados.
                </p>
                <Button className="mt-4" variant="outline" asChild>
                  <Link href="/settings">Ir para Configurações</Link>
                </Button>
              </>
            ) : (
              <>
                <p className="font-medium">
                  Nenhuma empresa corresponde aos filtros.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ajuste ou limpe os filtros para ampliar a consulta.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && !error && payload && (
        <ScreenerResultsList
          results={payload.results}
          counts={payload.counts}
        />
      )}
    </div>
  );
}
