"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChartColumnIncreasing,
  ChevronDown,
  CircleHelp,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
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
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePickerField } from "@/components/ui/date-picker-field";

type InputKey =
  "graham_eps" | "graham_book_value_per_share" | "bazin_dividend_per_share";
type InputValue = {
  inputKey: InputKey;
  value: number | null;
  source: string | null;
  asOf: string | null;
};
type Method = {
  value: number | null;
  differencePercent: number | null;
  asOf: string | null;
  source: string | null;
  unavailableReason: string | null;
};
type Opportunity = {
  ticker: string;
  name: string;
  quantity: number;
  positionDate: string | null;
  price: number | null;
  priceAsOf: string | null;
  fundamentalsAsOf: string | null;
  automaticDividend: {
    value: number | null;
    windowStart: string;
    windowEnd: string;
    observedPayments: number;
    source: "BRAPI";
    unavailableReason: string | null;
  } | null;
  financialPeriods: Array<{
    referenceDate: string;
    sourceDocument: "DFP" | "ITR";
  }>;
  inputs: InputValue[];
  methods: { graham: Method; bazin: Method };
};
type Draft = { value: string; source: string; asOf: string };
type Drafts = Record<string, Draft>;
type OpportunitiesPayload = {
  opportunities?: Opportunity[];
  settings?: { bazinTargetYield?: number };
  classificationStatus?: "resolved" | "partial" | "unavailable";
  classificationLookupFailures?: number;
};

const definitions: Array<{ key: InputKey; label: string; unit: string }> = [
  { key: "graham_eps", label: "Lucro por ação (LPA)", unit: "R$/ação" },
  {
    key: "graham_book_value_per_share",
    label: "Valor patrimonial por ação (VPA)",
    unit: "R$/ação",
  },
  {
    key: "bazin_dividend_per_share",
    label: "Dividendos anuais por ação",
    unit: "R$/ação",
  },
];
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? dateFormat.format(date)
    : "Data não informada";
}

function getDraftKey(ticker: string, inputKey: InputKey) {
  return `${ticker}:${inputKey}`;
}

function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-left leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MethodCard({
  title,
  method,
  formula,
}: {
  title: string;
  method: Method;
  formula: string;
}) {
  const difference = method.differencePercent;
  const below = difference !== null && difference >= 0;
  const above = difference !== null && difference < 0;
  const equal = difference === 0;
  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Help label={`Sobre ${title}`}>
          {formula} A referência é uma estimativa metodológica; não determina
          uma compra ou venda.
        </Help>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {method.value === null ? "—" : currency.format(method.value)}
      </p>
      {difference !== null ? (
        <p className="mt-1 flex items-center gap-1 text-sm font-medium text-foreground">
          {equal ? null : below ? (
            <ArrowDownRight className="size-4" aria-hidden="true" />
          ) : (
            <ArrowUpRight className="size-4" aria-hidden="true" />
          )}
          {equal
            ? "Na referência calculada"
            : `${percent.format(Math.abs(difference) / 100)} ${below ? "abaixo da referência" : "acima da referência"}`}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Comparação indisponível
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Base dos dados: {formatDate(method.asOf)}
      </p>
      {method.source && (
        <p className="mt-1 text-xs text-muted-foreground">
          Origem: {method.source}
        </p>
      )}
      {method.unavailableReason && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {method.unavailableReason}
        </p>
      )}
    </div>
  );
}

function PortfolioOpportunitySkeleton() {
  return (
    <div
      className="space-y-3"
      aria-label="Carregando análise da carteira"
      aria-busy="true"
    >
      {[0, 1].map((item) => (
        <Card key={item}>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PortfolioOpportunities({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const [draftOverrides, setDraftOverrides] = useState<Drafts>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [targetYieldOverride, setTargetYieldOverride] = useState<string | null>(
    null,
  );
  const [savingTargetYield, setSavingTargetYield] = useState(false);
  const queryClient = useQueryClient();
  const opportunitiesQuery = useQuery({
    queryKey: queryKeys.analyses.opportunities(),
    enabled,
    queryFn: () =>
      apiRequest<OpportunitiesPayload>(
        "/api/analyses/portfolio-opportunities",
        undefined,
        "Não foi possível carregar as oportunidades da carteira.",
      ),
  });
  const opportunities = opportunitiesQuery.data?.opportunities ?? [];
  const drafts = {
    ...opportunities.reduce<Drafts>((result, item) => {
      for (const input of item.inputs) {
        result[getDraftKey(item.ticker, input.inputKey)] = {
          value: input.value === null ? "" : String(input.value),
          source: input.source ?? "",
          asOf: input.asOf ?? new Date().toISOString().slice(0, 10),
        };
      }
      return result;
    }, {}),
    ...draftOverrides,
  };
  const configuredTargetYield =
    opportunitiesQuery.data?.settings?.bazinTargetYield;
  const targetYield =
    targetYieldOverride ??
    (typeof configuredTargetYield === "number" &&
    Number.isFinite(configuredTargetYield)
      ? String(configuredTargetYield)
      : "6");
  const loading = opportunitiesQuery.isPending;
  const error =
    !opportunitiesQuery.data && opportunitiesQuery.error instanceof Error
      ? opportunitiesQuery.error.message
      : null;
  const classificationStatus =
    opportunitiesQuery.data?.classificationStatus ?? "resolved";
  const classificationLookupFailures =
    opportunitiesQuery.data?.classificationLookupFailures ?? 0;

  useEffect(() => {
    const refreshAfterPortfolioUpdate = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.analyses.opportunities(),
      });
    };
    window.addEventListener("portfolio:updated", refreshAfterPortfolioUpdate);
    return () =>
      window.removeEventListener(
        "portfolio:updated",
        refreshAfterPortfolioUpdate,
      );
  }, [queryClient]);

  const load = useCallback(
    () => opportunitiesQuery.refetch(),
    [opportunitiesQuery],
  );

  function updateDraft(
    ticker: string,
    key: InputKey,
    field: keyof Draft,
    value: string,
  ) {
    const draftKey = getDraftKey(ticker, key);
    setDraftOverrides((current) => ({
      ...current,
      [draftKey]: {
        ...(drafts[draftKey] ?? { value: "", source: "", asOf: "" }),
        [field]: value,
      },
    }));
  }

  async function saveInput(ticker: string, inputKey: InputKey) {
    const draft = drafts[getDraftKey(ticker, inputKey)];
    if (!draft || !draft.value || !draft.source.trim() || !draft.asOf) {
      toast.error("Informe o valor, a origem e a data para salvar.");
      return;
    }
    setSaving(getDraftKey(ticker, inputKey));
    let failureMessage = "Não foi possível salvar o dado manual.";
    try {
      await apiRequest(
        "/api/analyses/portfolio-opportunities",
        {
          method: "POST",
          body: JSON.stringify({
            ticker,
            inputKey,
            value: Number(draft.value.replace(",", ".")),
            source: draft.source,
            asOf: draft.asOf,
          }),
        },
        failureMessage,
      );
      toast.success("Dado manual salvo com origem e data.");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.analyses.opportunities(),
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : failureMessage);
    } finally {
      setSaving(null);
    }
  }

  async function saveTargetYield() {
    const value = Number(targetYield.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      toast.error("Informe uma taxa anual maior que 0% e de até 100%.");
      return;
    }
    setSavingTargetYield(true);
    let failureMessage = "Não foi possível atualizar a taxa configurada.";
    try {
      await apiRequest(
        "/api/analyses/portfolio-opportunities/settings",
        {
          method: "POST",
          body: JSON.stringify({ bazinTargetYield: value }),
        },
        failureMessage,
      );
      toast.success("Taxa-alvo global atualizada.");
      setTargetYieldOverride(null);
      queryClient.setQueryData<OpportunitiesPayload>(
        queryKeys.analyses.opportunities(),
        (current) =>
          current
            ? {
                ...current,
                settings: { ...current.settings, bazinTargetYield: value },
              }
            : current,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.analyses.opportunities(),
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : failureMessage);
    } finally {
      setSavingTargetYield(false);
    }
  }

  if (loading) return <PortfolioOpportunitySkeleton />;

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 pt-6">
          <p role="alert" className="text-sm">
            {error}
          </p>
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
            novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!opportunities.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {classificationStatus === "unavailable"
              ? "Não foi possível confirmar a classe dos ativos"
              : classificationStatus === "partial"
                ? "Nenhuma ação elegível foi confirmada"
                : "Nenhuma ação importada encontrada"}
          </CardTitle>
          <CardDescription>
            {classificationStatus === "unavailable"
              ? "A consulta de classificação de ações está indisponível. A carteira pode conter ações; tente novamente mais tarde."
              : classificationStatus === "partial"
                ? `Não foi possível classificar ${classificationLookupFailures} ativo(s). Eles não foram incluídos nesta análise; a carteira não está sendo tratada como vazia.`
                : "Esta análise mostra apenas ações brasileiras confirmadas pela classificação da fonte e presentes nas posições importadas. ETFs, FIIs e BDRs ficam fora desta versão."}
          </CardDescription>
          {classificationStatus === "partial" && (
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
              novamente
            </Button>
          )}
          {classificationStatus === "unavailable" && (
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
              novamente
            </Button>
          )}
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.82fr)] xl:items-stretch">
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="hidden size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
                <ChartColumnIncreasing aria-hidden="true" className="size-7" />
              </span>
              <div className="max-w-2xl">
                <h2 className="mt-1 text-xl font-semibold tracking-tight">
                  Comparar referências das ações
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Referências de estudo, sem recomendação de aporte.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full bg-primary/10 px-4 py-2 text-primary sm:self-center">
              <p className="text-2xl font-semibold tabular-nums">
                {opportunities.length}
              </p>
              <p className="text-xs font-medium">
                {opportunities.length === 1
                  ? "ação analisada"
                  : "ações analisadas"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between gap-4 pt-5 sm:flex-row sm:items-center">
            <div className="max-w-xl space-y-1">
              <div className="flex items-center gap-1">
                <h2 className="font-medium">Taxa-alvo global do Bazin</h2>
                <Help label="Sobre a taxa inicial do Bazin">
                  A configuração começa em 6% ao ano, uma premissa tradicional
                  do método. Não é taxa universal recomendada. Ajustar aqui
                  aplica o mesmo valor a todas as ações elegíveis.
                </Help>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <label className="space-y-1 text-sm" htmlFor="bazin-target-yield">
                <span className="block text-xs text-muted-foreground">
                  Percentual anual
                </span>
                <Input
                  id="bazin-target-yield"
                  className="w-28"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.1"
                  value={targetYield}
                  onChange={(event) =>
                    setTargetYieldOverride(event.target.value)
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => void saveTargetYield()}
                disabled={savingTargetYield}
              >
                <Save className="mr-2 size-4" aria-hidden="true" />
                {savingTargetYield ? "Salvando" : "Salvar taxa"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {classificationStatus === "partial" && (
        <div
          className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-sm"
          role="status"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-status-warning"
            aria-hidden="true"
          />
          <span>
            Não foi possível confirmar a classe de{" "}
            {classificationLookupFailures} ativo(s). Eles não aparecem nesta
            análise.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
            novamente
          </Button>
        </div>
      )}
      {opportunities.map((item) => {
        const hasBoth =
          item.methods.graham.differencePercent !== null &&
          item.methods.bazin.differencePercent !== null;
        const split =
          hasBoth &&
          item.methods.graham.differencePercent! >= 0 !==
            item.methods.bazin.differencePercent! >= 0;
        return (
          <Card
            key={item.ticker}
            className="grid overflow-hidden lg:grid-cols-[minmax(14rem,0.72fr)_minmax(0,1.6fr)]"
          >
            <CardHeader className="gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:justify-center lg:border-b-0 lg:border-r lg:p-6">
              <div className="space-y-1">
                <CardTitle className="text-xl">
                  {item.ticker}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {item.name}
                  </span>
                </CardTitle>
                <CardDescription>
                  {item.quantity.toLocaleString("pt-BR")} ações na carteira ·
                  posição importada em {formatDate(item.positionDate)}
                </CardDescription>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <div className="sm:text-right">
                  <p className="text-xs text-muted-foreground">
                    Preço atual · {formatDate(item.priceAsOf)}
                  </p>
                  <p className="text-xl font-semibold tabular-nums">
                    {item.price === null
                      ? "Indisponível"
                      : currency.format(item.price)}
                  </p>
                </div>
                <Button asChild type="button" variant="outline" size="sm">
                  <Link
                    href={`/analyses?ticker=${encodeURIComponent(item.ticker)}`}
                  >
                    <Search className="mr-2 size-4" aria-hidden="true" />
                    Ver critérios
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 space-y-3 p-4 sm:p-5">
              {split && (
                <div
                  className="flex items-start gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-sm"
                  role="status"
                >
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-status-warning"
                    aria-hidden="true"
                  />
                  <span>
                    Os métodos ficam em lados diferentes da cotação atual. Essa
                    divergência pede leitura dos dados e das limitações de cada
                    referência.
                  </span>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <MethodCard
                  title="Número de Graham"
                  method={item.methods.graham}
                  formula="Fórmula usada: raiz quadrada de 22,5 × LPA × VPA. Requer lucro e patrimônio positivos por ação."
                />
                <MethodCard
                  title="Preço-teto de Bazin"
                  method={item.methods.bazin}
                  formula="Fórmula usada: dividendos anuais por ação ÷ taxa-alvo anual informada. O valor anual é preenchido manualmente e não confirma que os proventos sejam recorrentes; trate o resultado como cenário, não como critério de compra."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Dados financeiros automáticos:{" "}
                {item.financialPeriods.length
                  ? item.financialPeriods
                      .map(
                        ({ sourceDocument, referenceDate }) =>
                          `${sourceDocument} ${formatDate(referenceDate)}`,
                      )
                      .join(" · ")
                  : `indisponíveis${item.fundamentalsAsOf ? ` · base ${formatDate(item.fundamentalsAsOf)}` : ""}`}
                . Os totais publicados pela CVM não substituem LPA, VPA ou
                dividendos por ação sem conciliação confiável do número de
                ações.
              </p>
              <p className="text-xs text-muted-foreground">
                Proventos BRAPI · janela de 12 meses (
                {formatDate(item.automaticDividend?.windowStart ?? null)} a{" "}
                {formatDate(item.automaticDividend?.windowEnd ?? null)}):{" "}
                {item.automaticDividend?.value === null ||
                item.automaticDividend?.value === undefined
                  ? "sem eventos utilizáveis"
                  : `${currency.format(item.automaticDividend.value)} por ação observados`}
                . {item.automaticDividend?.observedPayments ?? 0} pagamentos.{" "}
                {item.automaticDividend?.unavailableReason ??
                  "A fonte não retornou eventos para o período."}{" "}
                O valor automático não entra no cálculo Bazin sem evidência de
                janela completa.
              </p>
              <Collapsible>
                <div className="border-t pt-3">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      type="button"
                      className="h-auto w-full justify-between px-1 py-2 text-left"
                    >
                      <span>Informar ou atualizar dados manuais</span>
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform duration-200 [[data-state=open]_&]:rotate-180"
                        aria-hidden="true"
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid gap-3 lg:grid-cols-2">
                      {definitions.map((definition) => {
                        const key = getDraftKey(item.ticker, definition.key);
                        const draft = drafts[key] ?? {
                          value: "",
                          source: "",
                          asOf: "",
                        };
                        const isSaving = saving === key;
                        return (
                          <form
                            key={definition.key}
                            className="space-y-2 rounded-md bg-muted/30 p-3"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveInput(item.ticker, definition.key);
                            }}
                          >
                            <label
                              htmlFor={`${item.ticker}-${definition.key}-value`}
                              className="text-sm font-medium"
                            >
                              {definition.label}{" "}
                              <span className="font-normal text-muted-foreground">
                                ({definition.unit})
                              </span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                id={`${item.ticker}-${definition.key}-value`}
                                type="number"
                                step="any"
                                min="0"
                                required
                                aria-label={`${definition.label}, valor`}
                                value={draft.value}
                                onChange={(event) =>
                                  updateDraft(
                                    item.ticker,
                                    definition.key,
                                    "value",
                                    event.target.value,
                                  )
                                }
                                placeholder="Valor"
                              />
                              <DatePickerField
                                id={`${item.ticker}-${definition.key}-as-of`}
                                label={`${definition.label}, data de referência`}
                                value={draft.asOf}
                                required
                                onChange={(value) =>
                                  updateDraft(
                                    item.ticker,
                                    definition.key,
                                    "asOf",
                                    value,
                                  )
                                }
                              />
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input
                                required
                                minLength={2}
                                maxLength={160}
                                aria-label={`${definition.label}, origem`}
                                value={draft.source}
                                onChange={(event) =>
                                  updateDraft(
                                    item.ticker,
                                    definition.key,
                                    "source",
                                    event.target.value,
                                  )
                                }
                                placeholder="Origem do dado"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                disabled={isSaving}
                                className="shrink-0"
                              >
                                <Save
                                  className="mr-2 size-4"
                                  aria-hidden="true"
                                />
                                {isSaving ? "Salvando" : "Salvar"}
                              </Button>
                            </div>
                            {draft.source && (
                              <p className="text-xs text-muted-foreground">
                                Origem manual: {draft.source} ·{" "}
                                {formatDate(draft.asOf || null)}. O valor
                                automático permanece separado.
                              </p>
                            )}
                          </form>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
