"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Filters = {
  positiveProfitYears?: number;
  equityPositive?: boolean;
  minimumRoe?: number;
  minimumNetMargin?: number;
  maximumPe?: number;
  maximumPb?: number;
};
type Metrics = {
  latestNetIncome: number | null;
  latestRevenue: number | null;
  latestEquity: number | null;
  roe: number | null;
  netMargin: number | null;
  pe: number | null;
  pb: number | null;
  positiveProfitYears: number;
};
type Result = {
  cnpj: string;
  cvmCode: string;
  name: string;
  sector: string | null;
  quantitativeEligible: boolean;
  securities: { ticker: string; name: string }[];
  metrics: Metrics;
};
type Counts = {
  issuers: number;
  withPositiveProfit: number;
  withEquity: number;
  withRoe: number;
  withNetMargin: number;
  withPe: number;
  withPb: number;
};
type Payload = { results: Result[]; counts: Counts };

const emptyCounts: Counts = {
  issuers: 0,
  withPositiveProfit: 0,
  withEquity: 0,
  withRoe: 0,
  withNetMargin: 0,
  withPe: 0,
  withPb: 0,
};
const percent = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});
const ratio = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) params.set(key, String(value));
  return params.toString();
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">
        {value === null ? "—" : `${ratio.format(value)}${suffix ?? ""}`}
      </dd>
    </div>
  );
}

export function ScreenerDashboard() {
  const [draft, setDraft] = useState<Filters>({});
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
                  disabled={(payload?.counts.withPe ?? 0) === 0}
                  value={draft.maximumPe ?? ""}
                  onChange={(event) =>
                    updateNumber("maximumPe", event.target.value)
                  }
                  placeholder="Sem base válida"
                />
                {(payload?.counts.withPe ?? 0) === 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Indisponível até validar valor de mercado por emissor e
                    classe.
                  </span>
                )}
              </label>
              <label className="space-y-2 text-sm font-medium">
                P/VP máximo
                <Input
                  aria-label="P/VP máximo"
                  type="number"
                  step="any"
                  disabled={(payload?.counts.withPb ?? 0) === 0}
                  value={draft.maximumPb ?? ""}
                  onChange={(event) =>
                    updateNumber("maximumPb", event.target.value)
                  }
                  placeholder="Sem base válida"
                />
                {(payload?.counts.withPb ?? 0) === 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Indisponível até validar valor de mercado por emissor e
                    classe.
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
            ? `${payload.results.length} de ${payload.counts.issuers} emissores`
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
            <p className="font-medium">
              Nenhuma empresa corresponde aos filtros.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajuste ou limpe os filtros para ampliar a consulta.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading &&
        !error &&
        payload?.results.map((company) => (
          <Card key={company.cnpj}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">{company.name}</CardTitle>
                  <CardDescription>
                    CVM {company.cvmCode}
                    {company.sector ? ` · ${company.sector}` : ""}
                  </CardDescription>
                  {company.quantitativeEligible === false && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Fundamentos quantitativos indisponíveis para este setor.
                    </p>
                  )}
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  aria-label={`Tickers de ${company.name}`}
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
            <CardContent>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Metric
                  label="Lucro líquido"
                  value={company.metrics.latestNetIncome}
                />
                <Metric
                  label="Patrimônio líquido"
                  value={company.metrics.latestEquity}
                />
                <Metric label="ROE" value={company.metrics.roe} suffix="%" />
                <Metric
                  label="Margem líquida"
                  value={company.metrics.netMargin}
                  suffix="%"
                />
                <Metric label="P/L" value={company.metrics.pe} />
                <Metric label="P/VP" value={company.metrics.pb} />
              </dl>
            </CardContent>
          </Card>
        ))}
      {payload && !error && (
        <p className="text-xs text-muted-foreground">
          Cobertura disponível: lucro {payload.counts.withPositiveProfit},
          patrimônio {payload.counts.withEquity}, ROE {payload.counts.withRoe},
          margem {payload.counts.withNetMargin}, P/L {payload.counts.withPe} e
          P/VP {payload.counts.withPb}.
        </p>
      )}
    </div>
  );
}
