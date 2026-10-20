"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CircleHelp, RefreshCw, Save } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PortfolioSummary } from "./portfolio-summary";
import {
  isSupportedAnalyzedEquity,
  PortfolioPositions,
} from "./portfolio-positions";
import {
  getOpportunityDraftKey,
  PortfolioOpportunityDetails,
} from "./portfolio-opportunity-details";
import type {
  OpportunityDraft,
  OpportunityDraftField,
  OpportunityInputKey,
  PortfolioOpportunity,
} from "./portfolio-opportunity-details";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-classification-list";

type InputKey = OpportunityInputKey;
type Draft = OpportunityDraft;
type Drafts = Record<string, OpportunityDraft>;
type OpportunitiesPayload = {
  opportunities?: PortfolioOpportunity[];
  settings?: { bazinTargetYield?: number };
  classificationStatus?: "resolved" | "partial" | "unavailable";
  classificationLookupFailures?: number;
};

function getDraftKey(ticker: string, inputKey: InputKey) {
  return getOpportunityDraftKey(ticker, inputKey);
}

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase();
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
  const allocationQuery = useQuery({
    queryKey: queryKeys.portfolio.allocation(),
    enabled,
    queryFn: async () => {
      const payload = await apiRequest<{
        positions?: PortfolioPosition[];
      }>(
        "/api/portfolio/allocation",
        undefined,
        "Não foi possível carregar os valores da carteira.",
      );
      if (!Array.isArray(payload.positions)) {
        throw new Error("Não foi possível carregar os valores da carteira.");
      }
      return { positions: payload.positions };
    },
  });
  const opportunities = opportunitiesQuery.data?.opportunities ?? [];
  const positions = allocationQuery.data?.positions ?? [];
  const positionsLoaded = Array.isArray(allocationQuery.data?.positions);
  const drafts = {
    ...opportunities.reduce<Drafts>((result, item) => {
      for (const input of item.inputs) {
        result[getDraftKey(item.ticker, input.inputKey)] = {
          value: input.value === null ? "" : String(input.value),
          source: input.source ?? "",
          asOf: input.asOf ?? "",
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
  const loading = opportunitiesQuery.isPending && allocationQuery.isPending;
  const opportunitiesError =
    !opportunitiesQuery.data && opportunitiesQuery.error instanceof Error
      ? opportunitiesQuery.error.message
      : null;
  const allocationError =
    !allocationQuery.data && allocationQuery.error instanceof Error
      ? allocationQuery.error.message
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

  function renderOpportunity(item: PortfolioOpportunity) {
    return (
      <PortfolioOpportunityDetails
        opportunity={item}
        drafts={drafts}
        saving={saving}
        onUpdateDraft={(key, field: OpportunityDraftField, value) =>
          updateDraft(item.ticker, key, field, value)
        }
        onSaveInput={(key) => void saveInput(item.ticker, key)}
      />
    );
  }

  const supportedPositionTickers = new Set(
    positions
      .filter(isSupportedAnalyzedEquity)
      .map((position) =>
        position.assetCode ? normalizeTicker(position.assetCode) : undefined,
      )
      .filter(Boolean),
  );
  const analysesByTicker = new Map(
    opportunities
      .filter((item) =>
        supportedPositionTickers.has(normalizeTicker(item.ticker)),
      )
      .map(
        (item) =>
          [normalizeTicker(item.ticker), renderOpportunity(item)] as const,
      ),
  );
  const fallbackOpportunities = opportunities.filter(
    (item) => !supportedPositionTickers.has(normalizeTicker(item.ticker)),
  );

  if (loading) return <PortfolioOpportunitySkeleton />;

  return (
    <div className="space-y-4">
      {allocationError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p role="alert" className="text-sm">
              {allocationError}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void allocationQuery.refetch()}
            >
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
              novamente
            </Button>
          </CardContent>
        </Card>
      )}
      {opportunitiesError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p role="alert" className="text-sm">
              {opportunitiesError}
            </p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
              novamente
            </Button>
          </CardContent>
        </Card>
      )}
      {positionsLoaded && positions.length > 0 && (
        <>
          <PortfolioSummary positions={positions} />
          <PortfolioPositions
            positions={positions}
            analysesByTicker={analysesByTicker}
          />
        </>
      )}
      {positionsLoaded && positions.length === 0 && !allocationError && (
        <Card>
          <CardHeader>
            <CardTitle>Sua carteira está vazia</CardTitle>
            <CardDescription>
              Importe ou cadastre posições para ver os valores e ativos aqui.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {!positionsLoaded && !allocationError && (
        <div role="status" className="space-y-2">
          <Skeleton className="h-28" />
          <p className="sr-only">Carregando posições da carteira</p>
        </div>
      )}
      {classificationStatus !== "resolved" && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-sm"
        >
          <AlertTriangle
            className="size-4 shrink-0 text-status-warning"
            aria-hidden="true"
          />
          <span>
            {classificationStatus === "unavailable"
              ? "Não foi possível analisar as ações agora. Os demais ativos continuam listados."
              : `Não foi possível confirmar a classe de ${classificationLookupFailures} ativo(s) para a análise de ações. Os demais ativos continuam listados.`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden="true" /> Tentar
            novamente
          </Button>
        </div>
      )}
      {opportunities.length === 0 &&
        positionsLoaded &&
        positions.length > 0 &&
        !opportunitiesError && (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação brasileira elegível para essas referências foi
            confirmada.
          </p>
        )}
      {analysesByTicker.size > 0 && !allocationError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-1">
                <p className="font-medium">Taxa-alvo global do Bazin</p>
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Sobre a taxa inicial do Bazin"
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <CircleHelp className="size-4" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72">
                      A taxa é uma premissa editável do cálculo de Bazin. Ela
                      não indica retorno garantido nem recomendação.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-xs text-muted-foreground">
                Premissa para as referências, não uma recomendação.
              </p>
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
      )}
      {fallbackOpportunities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Referências suspensas</CardTitle>
            <CardDescription>
              Não foi possível confirmar a classe do ativo na carteira. Os
              métodos e formulários estão suspensos até uma posição elegível ser
              confirmada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {fallbackOpportunities.map((item) => (
              <p key={item.ticker} className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {item.ticker} · {item.name}
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
