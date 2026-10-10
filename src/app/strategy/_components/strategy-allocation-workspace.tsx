"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  BookOpen,
  Building,
  ChartColumnIncreasing,
  ChevronRight,
  Coins,
  Globe,
  PiggyBank,
  Search,
  Settings2,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getApiMessage } from "@/lib/api-message";
import { getLearningClassHref } from "@/lib/asset-class-learning";
import {
  formatAmountInput,
  getCurrencyInputSelection,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  distributeRemainingPercentage,
  parseStrategyContributionAmount,
  parseStrategyPercentage,
  strategyPercentagesFromDraft,
  type StrategyPercentageDraft,
} from "@/lib/strategy-allocation-input";
import {
  strategyAssetClasses,
  getStrategyAssetClassColor,
  type StrategyAllocationPercentages,
} from "@/lib/strategy-allocation";
import {
  StrategyAllocationChart,
  type StrategyCompositionRow,
} from "./strategy-allocation-chart";

export type StrategyClassValue = {
  id: string;
  label: string;
  knownValueCents: string;
  currentPercentage: number;
};

type StrategyContributionPreview = {
  enteredContributionCents: string;
  reserveContributionCents: string | null;
  strategyContributionCents: string | null;
  reserveStatus: "applied" | "not_needed" | "not_configured" | "incomplete";
  reserveSelectedValueCents: string | null;
  reserveTargetValueCents: string | null;
  reserveDifferenceCents: string | null;
  simulation: {
    totalCents: string;
    contributionCents: string;
    unallocatedContributionCents: string;
    completeness: {
      complete: boolean;
      unvaluedPositionCount: number;
      unclassifiedKnownValueCents: string;
      valuationDate: string;
      valuationDates: string[];
    };
    allocations: Array<{
      id: (typeof strategyAssetClasses)[number]["id"];
      label: string;
      currentPercentage: number;
      targetPercentage: number;
      projectedPercentage: number;
      contributionValueCents: string;
    }>;
  } | null;
};

type Props = {
  classes: StrategyClassValue[];
  knownValueCents: string;
  valuationDate: string;
  positionCount: number;
  unclassifiedKnownValueCents: string;
  unvaluedPositionCount: number;
  savedAllocationPercentages: StrategyAllocationPercentages | null;
  allocationActive?: boolean;
  onSaved: (percentages: StrategyAllocationPercentages) => void;
  onActivated?: () => void;
};

function percentText(value: number) {
  return value.toFixed(2).replace(".", ",");
}

function initialDraft(
  saved: StrategyAllocationPercentages | null,
  classes: StrategyClassValue[],
  complete: boolean,
): StrategyPercentageDraft {
  return Object.fromEntries(
    strategyAssetClasses.map(({ id }) => {
      const current = classes.find((item) => item.id === id)?.currentPercentage;
      return [
        id,
        saved
          ? percentText(saved[id])
          : complete && current !== undefined
            ? percentText(current)
            : "",
      ];
    }),
  ) as StrategyPercentageDraft;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function StrategyAllocationWorkspace({
  classes,
  knownValueCents,
  valuationDate,
  positionCount,
  unclassifiedKnownValueCents,
  unvaluedPositionCount,
  savedAllocationPercentages,
  allocationActive = false,
  onSaved,
  onActivated,
}: Props) {
  const baselineComplete =
    BigInt(knownValueCents) > 0n &&
    BigInt(unclassifiedKnownValueCents) === 0n &&
    unvaluedPositionCount === 0;
  const [draft, setDraft] = useState<StrategyPercentageDraft>(() =>
    initialDraft(savedAllocationPercentages, classes, baselineComplete),
  );
  const [saved, setSaved] = useState(savedAllocationPercentages);
  const [active, setActive] = useState(allocationActive);
  const [draftChanged, setDraftChanged] = useState(false);
  const [editingOpen, setEditingOpen] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<CurrencyInputSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] =
    useState<StrategyContributionPreview | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const input = amountInputRef.current;
    const selection = selectionRef.current;
    if (!input || !selection) return;
    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    selectionRef.current = null;
  }, [contributionAmount]);

  const targetPercentages = useMemo(
    () => strategyPercentagesFromDraft(draft),
    [draft],
  );
  const parsedBasisPoints = strategyAssetClasses.map(({ id }) =>
    parseStrategyPercentage(draft[id]),
  );
  const percentageSum = parsedBasisPoints.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const currentById = new Map(classes.map((item) => [item.id, item]));
  const currentPercentages = Object.fromEntries(
    strategyAssetClasses.map(({ id }) => [
      id,
      currentById.get(id)?.currentPercentage ?? 0,
    ]),
  ) as StrategyAllocationPercentages;
  const allocationToShow = draftChanged
    ? targetPercentages
    : (saved ?? currentPercentages);
  const hasAllocationToShow =
    allocationToShow !== null &&
    strategyAssetClasses.some(({ id }) => allocationToShow[id] > 0);
  const allocationLabel = draftChanged
    ? targetPercentages
      ? "Composição em edição"
      : "Ajustando composição"
    : saved
      ? "Composição planejada"
      : "Distribuição atual";
  const chartData: StrategyCompositionRow[] = [
    { name: "Atual", ...currentPercentages },
    ...(targetPercentages && (saved || draftChanged)
      ? [{ name: saved ? "Planejada" : "Em edição", ...targetPercentages }]
      : []),
    ...(simulation?.simulation
      ? [
          {
            name: !simulation.simulation.completeness.complete
              ? "Após aporte · parcial"
              : simulation.simulation.completeness.valuationDates.length ===
                    1 &&
                  simulation.simulation.completeness.valuationDates[0] ===
                    simulation.simulation.completeness.valuationDate
                ? "Após aporte"
                : "Após aporte · aproximado",
            ...Object.fromEntries(
              simulation.simulation.allocations.map((item) => [
                item.id,
                item.projectedPercentage,
              ]),
            ),
          } as StrategyCompositionRow,
        ]
      : []),
  ];
  const classIcons = {
    fixed_income: Coins,
    brazilian_equities: ChartColumnIncreasing,
    international_etfs: Globe,
    fiis: Building,
  } as const;
  const classImages = {
    fixed_income: "/images/asset-classes/fixed-income-office.webp",
    brazilian_equities: "/images/asset-classes/brazilian-equities.webp",
    international_etfs: "/images/asset-classes/international-etfs.webp",
    fiis: "/images/asset-classes/fiis.webp",
  } as const;
  function updateDraft(
    id: (typeof strategyAssetClasses)[number]["id"],
    value: string,
  ) {
    setDraft((current) => ({ ...current, [id]: value }));
    setDraftChanged(true);
    setSimulation(null);
  }

  async function save(allocationPercentages: StrategyAllocationPercentages) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allocationPercentages }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível salvar a composição."),
        );
        return;
      }
      const percentages = (
        body as { allocationPercentages: StrategyAllocationPercentages }
      ).allocationPercentages;
      setSaved(percentages);
      setDraftChanged(false);
      setDraft(
        Object.fromEntries(
          strategyAssetClasses.map(({ id }) => [
            id,
            percentText(percentages[id]),
          ]),
        ) as StrategyPercentageDraft,
      );
      onSaved(percentages);
      setEditingOpen(false);
      toast.success(getApiMessage(body, "Composição escolhida salva."));
    } catch {
      toast.error("Não foi possível salvar a composição.");
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    setActivating(true);
    try {
      const response = await fetch("/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activateContributionPlanning: true }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível ativar a composição."),
        );
        return;
      }
      setActive(true);
      onActivated?.();
      window.dispatchEvent(new Event("portfolio:updated"));
      toast.success(
        getApiMessage(
          body,
          "Estratégia ativada para o planejamento de aportes.",
        ),
      );
    } catch {
      toast.error("Não foi possível ativar a composição.");
    } finally {
      setActivating(false);
    }
  }

  async function simulate() {
    const amount = parseStrategyContributionAmount(contributionAmount);
    if (!targetPercentages || amount === null || amount > 1_000_000_000_000) {
      setAmountError(
        "Informe um aporte maior que zero, com até duas casas decimais.",
      );
      return;
    }
    setAmountError(null);
    setSimulating(true);
    try {
      const response = await fetch("/api/portfolio/strategy/contribution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contributionAmount: amount,
          allocationPercentages: targetPercentages,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível simular este aporte."),
        );
        return;
      }
      setSimulation(body as StrategyContributionPreview);
    } catch {
      toast.error("Não foi possível simular este aporte.");
    } finally {
      setSimulating(false);
    }
  }

  function changeAmount(value: string) {
    const input = amountInputRef.current!;
    selectionRef.current = getCurrencyInputSelection(
      contributionAmount,
      value,
      input.selectionStart ?? value.length,
      input.selectionEnd ?? value.length,
      input.selectionDirection,
    );
    setContributionAmount(formatAmountInput(value));
    setAmountError(null);
    setSimulation(null);
  }

  return (
    <div className="space-y-4">
      <Sheet open={editingOpen} onOpenChange={setEditingOpen}>
        <div className="grid gap-4 lg:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.3fr)] lg:items-stretch">
          <Card>
            <CardContent className="grid gap-5 pt-6">
              <div className="flex min-w-0 items-center gap-4">
                <span className="hidden size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
                  <TrendingUp aria-hidden="true" className="size-7" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Patrimônio de longo prazo
                  </h2>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">
                    {formatCurrencyCents(knownValueCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Total investido em ativos de longo prazo ·{" "}
                    {formatDate(valuationDate)}
                    {positionCount === 0 ? " · sem posições" : ""}
                  </p>
                </div>
              </div>
              <div className="min-w-0 border-t pt-4">
                <p className="text-sm font-medium">{allocationLabel}</p>
                {hasAllocationToShow ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {strategyAssetClasses
                      .filter(({ id }) => allocationToShow?.[id] > 0)
                      .map(({ id, label }) => {
                        const Icon = classIcons[id];
                        const color = getStrategyAssetClassColor(id);
                        return (
                          <li
                            key={id}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <Icon
                              aria-hidden="true"
                              className="size-4 shrink-0"
                              style={{ color }}
                            />
                            <span className="min-w-0 text-muted-foreground">
                              {label}
                            </span>
                            <span className="font-semibold tabular-nums">
                              {percentText(allocationToShow![id])}%
                            </span>
                            <Link
                              href={getLearningClassHref(id)}
                              aria-label={`Aprender sobre ${label}`}
                              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <BookOpen
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              Aprender
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {draftChanged
                      ? "Complete o total para ver a composição."
                      : "Defina a composição desejada."}
                  </p>
                )}
              </div>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between sm:w-auto"
                >
                  <Settings2 aria-hidden="true" className="mr-2 size-4" />
                  Editar composição
                  <ChevronRight aria-hidden="true" className="ml-2 size-4" />
                </Button>
              </SheetTrigger>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <CardTitle>Distribuição por classe</CardTitle>
              <CardDescription>Atual, planejada e após aporte.</CardDescription>
            </CardHeader>
            <CardContent>
              <StrategyAllocationChart data={chartData} />
            </CardContent>
          </Card>
        </div>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader className="mb-6 pr-8">
            <SheetTitle>Editar composição</SheetTitle>
            <SheetDescription>
              Ajuste os percentuais. O total deve ser 100%.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            <div className="space-y-3">
              {strategyAssetClasses.map(({ id, label }) => {
                const color = getStrategyAssetClassColor(id);
                const image = classImages[id];
                const current = currentById.get(id);
                const percentageCents = parseStrategyPercentage(draft[id]);
                return (
                  <section
                    key={id}
                    aria-labelledby={`strategy-${id}-label`}
                    className="grid gap-4 rounded-xl border border-l-4 bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)_auto] sm:items-center"
                    style={{
                      borderLeftColor: color,
                      backgroundColor: `color-mix(in srgb, ${color} 5%, var(--card))`,
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Image
                        src={image}
                        alt=""
                        width={96}
                        height={72}
                        sizes="96px"
                        className="h-[4.5rem] w-24 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <h3
                          id={`strategy-${id}-label`}
                          className="text-sm font-semibold"
                        >
                          {label}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Valor atual
                        </p>
                        <p
                          id={`strategy-${id}-current`}
                          className="font-semibold tabular-nums"
                        >
                          {current
                            ? formatCurrencyCents(current.knownValueCents)
                            : "Sem valor classificado"}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <Label
                        htmlFor={`strategy-${id}`}
                        className="mb-1.5 block text-xs text-muted-foreground"
                      >
                        Percentual planejado
                      </Label>
                      <div className="relative w-full">
                        <Input
                          id={`strategy-${id}`}
                          aria-label={`${label} planejada em porcentagem`}
                          aria-describedby={`strategy-${id}-current`}
                          className="h-11 pr-9 text-base font-semibold tabular-nums"
                          type="text"
                          inputMode="decimal"
                          value={draft[id]}
                          onChange={(event) =>
                            updateDraft(id, event.target.value)
                          }
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                        >
                          %
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full whitespace-nowrap sm:w-auto"
                      disabled={percentageCents === null}
                      onClick={() => {
                        const distributed = distributeRemainingPercentage(
                          draft,
                          id,
                        )!;
                        setDraft(distributed);
                        setDraftChanged(true);
                        setSimulation(null);
                      }}
                    >
                      Distribuir restante
                    </Button>
                  </section>
                );
              })}
            </div>
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">Total planejado</span>
                <strong className="text-xl font-bold tabular-nums">
                  {percentText(percentageSum / 100)}%
                </strong>
              </div>
              <Progress
                value={Math.min(percentageSum / 100, 100)}
                aria-label="Percentual da composição planejada"
              />
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {percentageSum < 10000 &&
                  `Faltam ${percentText((10000 - percentageSum) / 100)}% para completar.`}
                {percentageSum > 10000 &&
                  `Excedem ${percentText((percentageSum - 10000) / 100)}%.`}
                {percentageSum === 10000 &&
                  targetPercentages &&
                  "Composição dentro do total de 100%."}
              </p>
            </div>
            <SheetFooter className="border-t pt-4 sm:justify-end">
              <Button
                onClick={() => void save(targetPercentages!)}
                disabled={!targetPercentages || saving}
                className="w-full sm:w-auto"
              >
                {saving ? "Salvando…" : "Salvar composição"}
              </Button>
            </SheetFooter>
            {!baselineComplete && (
              <Alert>
                <AlertDescription>
                  Parte do patrimônio de Longo Prazo está sem valor ou classe
                  reconhecida. A distribuição atual mostra apenas valores
                  classificados.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Próximo aporte</CardTitle>
            <CardDescription>
              Simule a divisão. Nada será movimentado.
            </CardDescription>
          </div>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href="/analyses">
              <Search className="mr-2 size-4" aria-hidden="true" />
              Analisar ações da carteira
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full space-y-2 sm:max-w-xs">
              <Label htmlFor="strategy-contribution">Valor disponível</Label>
              <Input
                ref={amountInputRef}
                id="strategy-contribution"
                inputMode="decimal"
                type="text"
                placeholder="R$ 0,00"
                value={contributionAmount}
                onChange={(event) => changeAmount(event.target.value)}
                aria-invalid={amountError !== null}
                aria-describedby={
                  amountError ? "strategy-amount-error" : undefined
                }
              />
              {amountError && (
                <p
                  id="strategy-amount-error"
                  className="text-sm text-destructive"
                >
                  {amountError}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => void simulate()}
              disabled={!targetPercentages || simulating}
            >
              {simulating ? "Calculando…" : "Simular aporte"}
            </Button>
          </div>
          {simulation && (
            <div
              className="space-y-4 rounded-lg border bg-muted/20 p-4 sm:p-5"
              aria-live="polite"
            >
              <ol
                aria-label="Sequência do aporte"
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
              >
                <li className="flex min-w-0 items-center gap-3 rounded-lg border border-status-info/40 bg-status-info/5 p-3 sm:p-4">
                  <WalletCards
                    aria-hidden="true"
                    className="hidden size-6 shrink-0 text-status-info sm:block"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-muted-foreground">
                      Valor informado
                    </span>
                    <strong className="mt-1 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                      {formatCurrencyCents(simulation.enteredContributionCents)}
                    </strong>
                  </span>
                </li>
                <li
                  aria-hidden="true"
                  className="flex justify-center text-muted-foreground"
                >
                  <ArrowDown className="size-4 sm:hidden" />
                  <ArrowRight className="hidden size-5 sm:block" />
                </li>
                <li className="flex min-w-0 items-center gap-3 rounded-lg border border-status-warning/40 bg-status-warning/5 p-3 sm:p-4">
                  <PiggyBank
                    aria-hidden="true"
                    className="hidden size-6 shrink-0 text-status-warning sm:block"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-muted-foreground">
                      {simulation.reserveStatus === "applied"
                        ? "Completar reserva"
                        : simulation.reserveStatus === "not_needed"
                          ? "Reserva completa"
                          : simulation.reserveStatus === "not_configured"
                            ? "Reserva sem meta"
                            : "Reserva"}
                    </span>
                    <strong className="mt-1 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                      {simulation.reserveContributionCents === null
                        ? "Indisponível"
                        : formatCurrencyCents(
                            simulation.reserveContributionCents,
                          )}
                    </strong>
                  </span>
                </li>
                <li
                  aria-hidden="true"
                  className="flex justify-center text-muted-foreground"
                >
                  <ArrowDown className="size-4 sm:hidden" />
                  <ArrowRight className="hidden size-5 sm:block" />
                </li>
                <li className="flex min-w-0 items-center gap-3 rounded-lg border border-status-success/40 bg-status-success/5 p-3 sm:p-4">
                  <TrendingUp
                    aria-hidden="true"
                    className="hidden size-6 shrink-0 text-status-success sm:block"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-muted-foreground">
                      Restante para Longo Prazo
                    </span>
                    <strong className="mt-1 block text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                      {simulation.strategyContributionCents === null
                        ? "Indisponível"
                        : formatCurrencyCents(
                            simulation.strategyContributionCents,
                          )}
                    </strong>
                  </span>
                </li>
              </ol>
              {simulation.reserveStatus === "incomplete" ? (
                <Alert variant="destructive">
                  <AlertTitle>
                    Não foi possível calcular a parte da Reserva
                  </AlertTitle>
                  <AlertDescription>
                    Revise as posições e os valores selecionados para a Reserva.
                    O valor disponível para Longo Prazo não foi estimado.
                    {simulation.reserveTargetValueCents !== null &&
                      ` Meta da Reserva: ${formatCurrencyCents(simulation.reserveTargetValueCents)}.`}
                  </AlertDescription>
                </Alert>
              ) : simulation.simulation ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3">
                    <p className="font-medium">
                      {!simulation.simulation.completeness.complete
                        ? "Plano parcial"
                        : simulation.simulation.completeness.valuationDates
                              .length === 1 &&
                            simulation.simulation.completeness
                              .valuationDates[0] ===
                              simulation.simulation.completeness.valuationDate
                          ? "Plano estimado"
                          : "Plano aproximado"}
                    </p>
                    <p className="text-sm tabular-nums">
                      Longo Prazo após aporte:{" "}
                      {formatCurrencyCents(
                        (
                          BigInt(simulation.simulation.totalCents) +
                          BigInt(simulation.simulation.contributionCents)
                        ).toString(),
                      )}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Valores consultados em{" "}
                    {formatDate(
                      simulation.simulation.completeness.valuationDate,
                    )}
                    {simulation.simulation.completeness.valuationDates.length >
                      0 &&
                      ` · disponíveis em ${simulation.simulation.completeness.valuationDates.map(formatDate).join(", ")}`}
                  </p>
                  {BigInt(simulation.simulation.unallocatedContributionCents) >
                    0n && (
                    <p className="text-sm text-muted-foreground">
                      Não distribuído:{" "}
                      {formatCurrencyCents(
                        simulation.simulation.unallocatedContributionCents,
                      )}
                      . O cálculo evita ultrapassar a composição escolhida.
                    </p>
                  )}
                  {!simulation.simulation.completeness.complete && (
                    <p className="text-sm text-muted-foreground">
                      Não cobre{" "}
                      {simulation.simulation.completeness.unvaluedPositionCount}{" "}
                      posição(ões) sem valor e{" "}
                      {formatCurrencyCents(
                        simulation.simulation.completeness
                          .unclassifiedKnownValueCents,
                      )}{" "}
                      sem classe reconhecida.
                    </p>
                  )}
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="text-sm font-semibold">
                      Distribuição do longo prazo
                    </h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {simulation.simulation.allocations.map((item) => (
                        <li
                          key={item.id}
                          className="min-w-0 rounded-lg border p-4 transition-shadow hover:shadow-sm"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${getStrategyAssetClassColor(item.id)} 10%, var(--card))`,
                            borderColor: `color-mix(in srgb, ${getStrategyAssetClassColor(item.id)} 52%, var(--border))`,
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-3 text-sm font-medium">
                            {(() => {
                              const Icon = classIcons[item.id];
                              return (
                                <span
                                  aria-hidden="true"
                                  className="flex size-10 shrink-0 items-center justify-center rounded-full"
                                  style={{
                                    backgroundColor: `color-mix(in srgb, ${getStrategyAssetClassColor(item.id)} 22%, transparent)`,
                                    color: getStrategyAssetClassColor(item.id),
                                  }}
                                >
                                  <Icon className="size-5" />
                                </span>
                              );
                            })()}
                            {item.label}
                          </span>
                          <div className="mt-3 tabular-nums">
                            <strong
                              className={`block text-2xl font-semibold tracking-tight ${item.contributionValueCents === "0" ? "text-muted-foreground" : ""}`}
                            >
                              {formatCurrencyCents(item.contributionValueCents)}
                            </strong>
                            <span className="mt-1 block text-sm text-muted-foreground">
                              {percentText(item.projectedPercentage)}% depois do
                              aporte
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  O aporte foi destinado à Reserva.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Assistente de aportes</p>
              <p className="text-sm text-muted-foreground">
                {active
                  ? "Usando esta composição para posições de Longo Prazo."
                  : "A configuração atual continua ativa até você escolher a Estratégia."}
              </p>
            </div>
            {!active && (
              <Button
                type="button"
                variant="outline"
                disabled={!saved || activating}
                onClick={() => void activate()}
              >
                {activating ? "Ativando…" : "Usar Estratégia no assistente"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
