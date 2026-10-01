"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info, ChevronDown } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PositionCombinationSuggestions } from "@/app/portfolio/_components/position-combination-suggestions";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { formatCurrency } from "@/lib/utils";
import {
  formatCurrencyCents,
  portfolioMoneySourceLabels,
} from "@/lib/portfolio-money";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { getApiMessage } from "@/lib/api-message";

type Holding = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  maturityAt: string | null;
  positionCount: number;
  unvaluedPositions: number;
  value: number | null;
  valueCents?: string | null;
  valueSource?: string;
  estimationBaseDate?: string | null;
  estimatedThrough?: string | null;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
  selected: boolean;
  assignedObjectiveId?: string | null;
  assignedObjectiveName?: string | null;
};

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

type EditorData = {
  monthlyExpenses: number | null;
  targetMonths: number | null;
  selectedAssetKeys: string[];
  configured: boolean;
  holdings: Holding[];
  selectedPositionCount: number;
  missingSelectionCount: number;
  calculation: EmergencyReserveCalculation;
};

type TransferDetails = {
  assetKey: string;
  product: string;
  value: number;
  fromObjectiveId: string;
  fromObjectiveName: string;
  toObjectiveId: string;
};
type TransferImpact = {
  objectiveId: string;
  objectiveName: string;
  currentValue: number | null;
  knownValue: number;
  targetAmount: number | null;
  progressPercent: number | null;
  transferredValue: number;
  transferredPositionCount: number;
};
type PendingTransfer = {
  assetKeys: string[];
  transfers: TransferDetails[];
  impacts: TransferImpact[];
};

const loadErrorMessage = "Não foi possível carregar a configuração da reserva.";

export function EmergencyReserveEditor() {
  const [data, setData] = useState<EditorData | null>(null);
  const [monthlyExpenses, setMonthlyExpenses] = useState("");
  const [targetMonths, setTargetMonths] = useState("");
  const [customMonths, setCustomMonths] = useState("");
  const [monthChoice, setMonthChoice] = useState<"3" | "6" | "12" | "custom">(
    "custom",
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewCalculation, setPreviewCalculation] =
    useState<EmergencyReserveCalculation | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [pendingTransfer, setPendingTransfer] =
    useState<PendingTransfer | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch("/api/emergency-reserve")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          setError(
            getApiMessage(
              body,
              "Não foi possível carregar a configuração da reserva.",
            ),
          );
          return;
        }
        const data = body as EditorData;
        setData(data);
        setMonthlyExpenses(data.monthlyExpenses?.toString() ?? "");
        setTargetMonths(data.targetMonths?.toString() ?? "");
        const loadedMonths = data.targetMonths?.toString() ?? "";
        setCustomMonths(loadedMonths);
        setMonthChoice(
          loadedMonths === "3" || loadedMonths === "6" || loadedMonths === "12"
            ? loadedMonths
            : "custom",
        );
        setSelectedKeys(new Set(data.selectedAssetKeys));
        setPreviewCalculation(null);
        setPreviewFailed(false);
        setError(null);
      })
      .catch(() => {
        setError(loadErrorMessage);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener("portfolio:updated", loadData);
    return () => window.removeEventListener("portfolio:updated", loadData);
  }, [loadData]);

  const selectedKeysSignature = [...selectedKeys].sort().join("|");
  useEffect(() => {
    const expenses = Number(monthlyExpenses);
    const months = Number(targetMonths);
    if (
      !data ||
      !monthlyExpenses ||
      !Number.isFinite(expenses) ||
      expenses <= 0 ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 1200
    ) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/emergency-reserve", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          monthlyExpenses: expenses,
          targetMonths: months,
          selectedAssetKeys: selectedKeysSignature
            ? selectedKeysSignature.split("|")
            : [],
        }),
      })
        .then(async (response) => {
          const body: unknown = await response.json();
          if (!response.ok) throw new Error("reserve_preview_failed");
          return typeof body === "object" &&
            body !== null &&
            "calculation" in body
            ? (body as EditorData).calculation
            : (body as EmergencyReserveCalculation);
        })
        .then(setPreviewCalculation)
        .catch(() => {
          if (!controller.signal.aborted) setPreviewFailed(true);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [data, monthlyExpenses, selectedKeysSignature, targetMonths]);

  async function save(
    event?: React.FormEvent<HTMLFormElement>,
    requestedKeys = [...selectedKeys],
    transfers: TransferDetails[] = [],
    transferImpacts: TransferImpact[] = [],
  ) {
    event?.preventDefault();
    const expenses = Number(monthlyExpenses);
    const months = Number(targetMonths);
    if (
      !monthlyExpenses ||
      !Number.isFinite(expenses) ||
      expenses <= 0 ||
      expenses > 1_000_000_000_000
    ) {
      setFormError(
        "Informe um custo mensal maior que zero e de até R$ 1.000.000.000.000,00.",
      );
      return;
    }
    if (
      !targetMonths ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 1200
    ) {
      setFormError(
        "Informe sua meta pessoal como um número inteiro de 1 a 1200 meses.",
      );
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/emergency-reserve", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthlyExpenses: expenses,
          targetMonths: months,
          selectedAssetKeys: requestedKeys,
          ...(transfers.length ? { transfers } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível salvar a configuração."),
        );
        return;
      }
      const savedData = body as EditorData;
      setData(savedData);
      setMonthlyExpenses(savedData.monthlyExpenses?.toString() ?? "");
      setTargetMonths(savedData.targetMonths?.toString() ?? "");
      const loadedMonths = savedData.targetMonths?.toString() ?? "";
      setCustomMonths(loadedMonths);
      setMonthChoice(
        loadedMonths === "3" || loadedMonths === "6" || loadedMonths === "12"
          ? loadedMonths
          : "custom",
      );
      setSelectedKeys(new Set(savedData.selectedAssetKeys));
      setPreviewCalculation(null);
      setPreviewFailed(false);
      const transferMessage = transfers.length
        ? createTransferSuccessMessage(transfers, transferImpacts)
        : null;
      setTransferSuccess(transferMessage);
      setPendingTransfer(null);
      toast.success(
        getApiMessage(
          body,
          transferMessage ?? "Reserva atualizada com sucesso.",
        ),
      );
      window.dispatchEvent(new Event("portfolio:updated"));
    } catch {
      setPendingTransfer(null);
      toast.error("Não foi possível salvar a configuração. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function toggleHolding(assetKey: string) {
    setPreviewCalculation(null);
    setPreviewFailed(false);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(assetKey)) next.delete(assetKey);
      else next.add(assetKey);
      return next;
    });
  }

  const selectedHoldings =
    data?.holdings.filter((holding) => selectedKeys.has(holding.assetKey)) ??
    [];
  const hasCurrentDraft = Boolean(
    data &&
    monthlyExpenses === (data.monthlyExpenses?.toString() ?? "") &&
    targetMonths === (data.targetMonths?.toString() ?? "") &&
    selectedKeysSignature === [...data.selectedAssetKeys].sort().join("|"),
  );
  const visibleCalculation =
    previewCalculation ?? (hasCurrentDraft ? data!.calculation : null);
  const selectedHasIncompleteValues =
    selectedKeys.size > selectedHoldings.length ||
    selectedHoldings.some(
      (holding) => holding.value === null || holding.unvaluedPositions > 0,
    );
  const hasValidReserveTarget =
    Number(monthlyExpenses) > 0 &&
    Number.isInteger(Number(targetMonths)) &&
    Number(targetMonths) >= 1 &&
    Number(targetMonths) <= 1200 &&
    Number.isFinite(Number(monthlyExpenses));
  const previewLoading =
    hasValidReserveTarget &&
    !hasCurrentDraft &&
    previewCalculation === null &&
    !previewFailed;

  return (
    <section className="space-y-5" data-testid="reserve-editor">
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        aria-live="polite"
        role={error && !data ? "alert" : "status"}
      >
        {loading
          ? "Carregando configuração..."
          : error && !data
            ? loadErrorMessage
            : data?.configured
              ? `Meta pessoal de ${data.targetMonths} meses`
              : "Configuração pessoal ainda não definida"}
        {data && (
          <>
            {" · "}
            {selectedKeys.size}{" "}
            {selectedKeys.size === 1
              ? "grupo selecionado"
              : "grupos selecionados"}
          </>
        )}
      </p>
      {loading && (
        <div
          className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          data-testid="reserve-editor-loading-layout"
          aria-hidden="true"
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="h-16 animate-pulse rounded-md bg-muted" />
              <div className="h-16 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      )}
      {error && !data && (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoading(true);
              loadData();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {data && (
        <form className="space-y-5" onSubmit={save}>
          <div
            className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            data-testid="reserve-editor-layout"
          >
            <div className="space-y-5">
              <section
                aria-labelledby="reserve-target-title"
                className="space-y-4"
              >
                <h3 id="reserve-target-title" className="text-sm font-semibold">
                  Sua meta pessoal
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="monthly-expenses">Custo mensal</Label>
                    <Input
                      id="monthly-expenses"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={monthlyExpenses}
                      onChange={(event) => {
                        setPreviewCalculation(null);
                        setPreviewFailed(false);
                        setMonthlyExpenses(event.target.value);
                      }}
                      aria-describedby="reserve-cost-help"
                      required
                    />
                    <p
                      id="reserve-cost-help"
                      className="text-xs text-muted-foreground"
                    >
                      Use o valor que melhor representa suas despesas mensais.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Meta pessoal em meses</p>
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Atalhos de meses"
                    >
                      {(["3", "6", "12", "custom"] as const).map((choice) => (
                        <Button
                          key={choice}
                          type="button"
                          size="sm"
                          variant={
                            monthChoice === choice ? "default" : "outline"
                          }
                          aria-pressed={monthChoice === choice}
                          onClick={() => {
                            setPreviewCalculation(null);
                            setPreviewFailed(false);
                            if (monthChoice === "custom")
                              setCustomMonths(targetMonths);
                            setMonthChoice(choice);
                            setTargetMonths(
                              choice === "custom" ? customMonths : choice,
                            );
                            setFormError(null);
                          }}
                        >
                          {choice === "custom"
                            ? "Personalizado"
                            : `${choice} meses`}
                        </Button>
                      ))}
                    </div>
                    {monthChoice === "custom" && (
                      <div className="space-y-2">
                        <Label htmlFor="target-months">
                          Quantidade de meses
                        </Label>
                        <Input
                          id="target-months"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="1200"
                          step="1"
                          value={targetMonths}
                          onChange={(event) => {
                            setPreviewCalculation(null);
                            setPreviewFailed(false);
                            setTargetMonths(event.target.value);
                            setCustomMonths(event.target.value);
                          }}
                          aria-describedby="reserve-months-help"
                          required
                        />
                      </div>
                    )}
                    <p
                      id="reserve-months-help"
                      className="text-xs text-muted-foreground"
                    >
                      A meta em reais é calculada pelo custo mensal multiplicado
                      pelos meses que você definiu.
                    </p>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                        >
                          <Info aria-hidden="true" className="mr-1 size-3.5" />
                          Sobre os atalhos
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="max-w-xs text-sm"
                      >
                        A quantidade de meses depende da estabilidade e
                        previsibilidade da sua renda e das suas circunstâncias.
                        Os atalhos não são recomendações.
                      </PopoverContent>
                    </Popover>
                    {hasValidReserveTarget && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">
                          Meta calculada pela sua escolha:{" "}
                        </span>
                        <strong className="tabular-nums">
                          {previewLoading
                            ? "Calculando..."
                            : visibleCalculation?.targetValueCents
                              ? formatCurrencyCents(
                                  visibleCalculation.targetValueCents,
                                )
                              : "—"}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <PositionCombinationSuggestions
                endpoint="/api/emergency-reserve/suggestions"
                title="Encontrar grupos pelo valor"
                description="Digite os números do saldo conhecido; os centavos são preenchidos automaticamente."
                amountLabel="Valor conhecido da reserva"
                comparisonDetails="Compara o total com valores atuais: estimativa de CDB DI/CDI quando disponível ou valor importado. Não identifica finalidade, titularidade, liquidez ou condições de resgate."
                requestBody={{
                  reserveTargetAmount: hasValidReserveTarget
                    ? (visibleCalculation?.targetValue ?? null)
                    : null,
                }}
                holdings={data.holdings}
                onApply={(assetKeys, candidate) => {
                  if (candidate?.transfers?.length) {
                    setPendingTransfer({
                      assetKeys,
                      transfers: candidate.transfers,
                      impacts: candidate.impacts ?? [],
                    });
                    return false;
                  }
                  setSelectedKeys(new Set(assetKeys));
                  setPreviewCalculation(null);
                  setPreviewFailed(false);
                  setTransferSuccess(null);
                }}
              />
            </div>

            <fieldset className="min-w-0 space-y-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-semibold">
                Posições consideradas na reserva
              </legend>
              <p className="text-xs text-muted-foreground">
                {selectedKeys.size} selecionado(s) · {data.holdings.length}{" "}
                disponíveis
              </p>
              <div className="rounded-lg bg-muted/40 p-3" aria-live="polite">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    Valor conhecido selecionado
                  </span>
                  <span className="font-semibold tabular-nums">
                    {previewLoading
                      ? "Calculando..."
                      : visibleCalculation
                        ? formatCurrencyCents(
                            visibleCalculation.selectedValueCents ?? null,
                          )
                        : "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedKeys.size} grupo(s) selecionado(s)
                  {selectedHasIncompleteValues
                    ? " · Parcial: há valores indisponíveis ou posições sem correspondência"
                    : " · Valores disponíveis para todos os grupos selecionados"}
                </p>
              </div>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="group w-full justify-between"
                  >
                    Ver {data.holdings.length} posições
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 transition-transform group-data-[state=open]:rotate-180"
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <fieldset className="space-y-3">
                    <legend className="sr-only">
                      Investimentos que você quer considerar na reserva
                    </legend>
                    <p className="text-sm text-muted-foreground">
                      Somente grupos classificados como renda fixa aparecem
                      aqui. A classe não confirma prazo nem condições de
                      resgate.
                    </p>
                    {data.missingSelectionCount > 0 && (
                      <div
                        role="status"
                        className="space-y-3 rounded-md border p-3 text-sm"
                      >
                        <p>
                          {data.missingSelectionCount} grupo(s) selecionado(s)
                          não tem correspondência inequívoca com a importação
                          mais recente e fica(m) fora do cálculo até ser(em)
                          selecionado(s) novamente.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPreviewCalculation(null);
                            setPreviewFailed(false);
                            const visibleKeys = new Set(
                              data.holdings.map((holding) => holding.assetKey),
                            );
                            setSelectedKeys(
                              (current) =>
                                new Set(
                                  [...current].filter((key) =>
                                    visibleKeys.has(key),
                                  ),
                                ),
                            );
                          }}
                        >
                          Remover grupos sem correspondência
                        </Button>
                      </div>
                    )}
                    {data.holdings.length === 0 ? (
                      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        Importe uma posição da carteira para escolher os
                        investimentos da reserva.
                      </p>
                    ) : (
                      <ul className="grid max-h-[min(28rem,45dvh)] gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-1">
                        {data.holdings.map((holding) => (
                          <li
                            key={holding.assetKey}
                            className="min-w-0 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`reserve-holding-${holding.assetKey}`}
                                className="mt-1"
                                checked={selectedKeys.has(holding.assetKey)}
                                disabled={
                                  holding.assignedObjectiveId !== undefined &&
                                  holding.assignedObjectiveId !== null &&
                                  holding.assignedObjectiveId !==
                                    reserveObjectiveId
                                }
                                onCheckedChange={() =>
                                  toggleHolding(holding.assetKey)
                                }
                              />
                              <label
                                htmlFor={`reserve-holding-${holding.assetKey}`}
                                className="min-w-0 flex-1 cursor-pointer"
                              >
                                <span className="block font-medium">
                                  {holding.product}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {[
                                    holding.assetCode,
                                    holding.institution,
                                    holding.issuer,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") ||
                                    "Sem código ou instituição informados"}
                                  {holding.positionCount > 1 &&
                                    ` · ${holding.positionCount} posições agrupadas`}
                                </span>
                                {holding.assignedObjectiveId !== undefined &&
                                  holding.assignedObjectiveId !== null &&
                                  holding.assignedObjectiveId !==
                                    reserveObjectiveId && (
                                    <span className="mt-1 block text-xs text-muted-foreground">
                                      Vinculada a{" "}
                                      {holding.assignedObjectiveName}; remova de
                                      lá para incluir na reserva.
                                    </span>
                                  )}
                                <span className="block text-xs text-muted-foreground">
                                  {holding.value === null
                                    ? "Sem valor informado"
                                    : holding.valueCents
                                      ? formatCurrencyCents(holding.valueCents)
                                      : formatCurrency(holding.value)}
                                  {holding.unvaluedPositions > 0 &&
                                    ` · ${holding.unvaluedPositions} posição(ões) sem valor`}
                                </span>
                                {holding.valueSource && (
                                  <span className="block text-xs text-muted-foreground">
                                    Origem:{" "}
                                    {portfolioMoneySourceLabels[
                                      holding.valueSource as keyof typeof portfolioMoneySourceLabels
                                    ] ?? holding.valueSource}
                                  </span>
                                )}
                                {holding.estimationBaseDate && (
                                  <span className="block text-xs text-muted-foreground">
                                    Data-base CURVA:{" "}
                                    {date.format(
                                      new Date(
                                        `${holding.estimationBaseDate}T00:00:00Z`,
                                      ),
                                    )}
                                  </span>
                                )}
                                {holding.estimatedThrough && (
                                  <span className="block text-xs text-muted-foreground">
                                    Estimativa{" "}
                                    {holding.cdbEstimateStatus === "provisional"
                                      ? "parcial "
                                      : ""}
                                    até{" "}
                                    {date.format(
                                      new Date(
                                        `${holding.estimatedThrough}T00:00:00Z`,
                                      ),
                                    )}
                                  </span>
                                )}
                                {holding.cdbEstimateLimitation && (
                                  <span className="block text-xs text-muted-foreground">
                                    {holding.cdbEstimateLimitation}
                                  </span>
                                )}
                              </label>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </fieldset>
                </CollapsibleContent>
              </Collapsible>
            </fieldset>
          </div>

          <div
            data-testid="reserve-save-footer"
            className="sticky bottom-0 z-10 w-full min-w-0 space-y-3 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_20px_-16px_hsl(var(--foreground)/0.35)] backdrop-blur"
          >
            <p className="text-xs text-muted-foreground">
              O cálculo usa o valor estimado para CDB DI/CDI quando disponível;
              nos demais casos, usa o valor informado na importação. Confirme
              com a instituição o prazo e as condições de resgate.
            </p>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            {transferSuccess && (
              <p role="status" className="text-sm text-emerald-700">
                {transferSuccess}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Salvar configuração"}
              </Button>
            </div>
          </div>
        </form>
      )}
      <AlertDialog
        open={pendingTransfer !== null}
        onOpenChange={() => setPendingTransfer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar transferência para a Reserva
            </AlertDialogTitle>
            <AlertDialogDescription>
              As posições listadas sairão dos objetivos atuais e passarão para a
              Reserva na mesma transação que salva a configuração.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {pendingTransfer?.transfers.map((transfer) => (
              <div
                key={transfer.assetKey}
                className="rounded-md border p-3 text-sm"
              >
                <p className="font-medium">{transfer.product}</p>
                <p className="text-muted-foreground">
                  De {transfer.fromObjectiveName} para Reserva ·{" "}
                  {formatCurrency(transfer.value)}
                </p>
              </div>
            ))}
          </div>
          {pendingTransfer?.impacts.length ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="mb-2 font-medium">
                Saldo esperado após a transferência
              </p>
              <ul className="space-y-1">
                {pendingTransfer.impacts.map((impact) => (
                  <li key={impact.objectiveId}>
                    {impact.objectiveName}:{" "}
                    {impact.currentValue === null
                      ? `total indisponível · ${formatCurrency(impact.knownValue)} conhecidos`
                      : formatCurrency(impact.currentValue)}
                    {impact.targetAmount === null
                      ? ""
                      : ` de ${formatCurrency(impact.targetAmount)}`}
                    {impact.progressPercent === null
                      ? ""
                      : ` (${impact.progressPercent.toFixed(1)}%)`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !pendingTransfer}
              onClick={(event) => {
                event.preventDefault();
                const transfer = pendingTransfer!;
                void save(
                  undefined,
                  transfer.assetKeys,
                  transfer.transfers,
                  transfer.impacts,
                );
              }}
            >
              {saving ? "Transferindo…" : "Usar e transferir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function createTransferSuccessMessage(
  transfers: TransferDetails[],
  impacts: TransferImpact[],
) {
  const byObjective = new Map<string, TransferDetails[]>();
  for (const transfer of transfers) {
    const items = byObjective.get(transfer.fromObjectiveId) ?? [];
    items.push(transfer);
    byObjective.set(transfer.fromObjectiveId, items);
  }
  const sourceMessages = [...byObjective].map(([objectiveId, items]) => {
    const impact = impacts.find((entry) => entry.objectiveId === objectiveId)!;
    const target =
      impact.targetAmount === null
        ? ""
        : ` de ${formatCurrency(impact.targetAmount)}`;
    const balance =
      impact.currentValue === null
        ? `total indisponível; ${formatCurrency(impact.knownValue)} conhecidos${target}`
        : `${formatCurrency(impact.currentValue)}${target}`;
    return `${items.length} ${items.length === 1 ? "posição foi transferida" : "posições foram transferidas"} de ${items[0].fromObjectiveName} para Reserva. ${items[0].fromObjectiveName} agora possui ${balance}`;
  });
  return sourceMessages.join(" ");
}
