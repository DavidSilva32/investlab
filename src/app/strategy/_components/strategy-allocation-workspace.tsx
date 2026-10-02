"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiMessage } from "@/lib/api-message";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  StrategyAllocationChart,
  strategyClasses,
  type StrategyClassId,
  type StrategyCompositionRow,
  type StrategyPercentages,
} from "./strategy-allocation-chart";

export type StrategyClassValue = {
  id: string;
  label: string;
  knownValueCents: string;
  currentPercentage: number;
};

type StrategyContributionPreview = {
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
    id: StrategyClassId;
    label: string;
    currentPercentage: number;
    targetPercentage: number;
    projectedPercentage: number;
    contributionValueCents: string;
  }>;
};

type Props = {
  classes: StrategyClassValue[];
  knownValueCents: string;
  unclassifiedKnownValueCents: string;
  unvaluedPositionCount: number;
  savedAllocationPercentages: StrategyPercentages | null;
  onSaved: (percentages: StrategyPercentages) => void;
};

type Draft = Record<StrategyClassId, string>;

function initialDraft(
  saved: StrategyPercentages | null,
  classes: StrategyClassValue[],
  complete: boolean,
): Draft {
  return Object.fromEntries(
    strategyClasses.map(({ id }) => {
      const current = classes.find((item) => item.id === id)?.currentPercentage;
      return [
        id,
        saved
          ? String(saved[id])
          : complete && current !== undefined
            ? current.toFixed(2)
            : "",
      ];
    }),
  ) as Draft;
}

function getPercentageCents(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cents <= 10000 ? cents : null;
}

function toPercentages(draft: Draft): StrategyPercentages | null {
  const values = strategyClasses.map(({ id }) => getPercentageCents(draft[id]));
  if (values.some((value) => value === null)) return null;
  if (
    values.reduce<number>((sum, value) => sum + (value as number), 0) !== 10000
  )
    return null;
  return Object.fromEntries(
    strategyClasses.map(({ id }, index) => [id, values[index]! / 100]),
  ) as StrategyPercentages;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function StrategyAllocationWorkspace({
  classes,
  knownValueCents,
  unclassifiedKnownValueCents,
  unvaluedPositionCount,
  savedAllocationPercentages,
  onSaved,
}: Props) {
  const baselineComplete =
    BigInt(knownValueCents) > 0n &&
    BigInt(unclassifiedKnownValueCents) === 0n &&
    unvaluedPositionCount === 0;
  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(savedAllocationPercentages, classes, baselineComplete),
  );
  const [contributionAmount, setContributionAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulation, setSimulation] =
    useState<StrategyContributionPreview | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const targetPercentages = useMemo(() => toPercentages(draft), [draft]);
  const percentageSum = strategyClasses.reduce(
    (sum, { id }) => sum + (getPercentageCents(draft[id]) ?? 0),
    0,
  );
  const currentById = new Map(classes.map((item) => [item.id, item]));
  const currentPercentages = Object.fromEntries(
    strategyClasses.map(({ id }) => [
      id,
      currentById.get(id)?.currentPercentage ?? 0,
    ]),
  ) as StrategyPercentages;

  const chartData: StrategyCompositionRow[] = [
    { name: "Atual", ...currentPercentages },
    ...(targetPercentages ? [{ name: "Escolhida", ...targetPercentages }] : []),
    ...(simulation
      ? [
          {
            name: !simulation.completeness.complete
              ? "Após aporte · parcial"
              : simulation.completeness.valuationDates.length === 1 &&
                  simulation.completeness.valuationDates[0] ===
                    simulation.completeness.valuationDate
                ? "Após aporte"
                : "Após aporte · aproximado",
            ...Object.fromEntries(
              simulation.allocations.map((item) => [
                item.id,
                item.projectedPercentage,
              ]),
            ),
          } as StrategyCompositionRow,
        ]
      : []),
  ];

  function updateDraft(id: StrategyClassId, value: string) {
    setDraft((current) => ({ ...current, [id]: value }));
    setSimulation(null);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allocationPercentages: targetPercentages }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível salvar a composição."),
        );
        return;
      }
      onSaved(
        (body as { allocationPercentages: StrategyPercentages })
          .allocationPercentages,
      );
      toast.success(getApiMessage(body, "Composição escolhida salva."));
    } catch {
      toast.error("Não foi possível salvar a composição.");
    } finally {
      setSaving(false);
    }
  }

  async function simulate() {
    const amount = Number(contributionAmount);
    if (!targetPercentages || !Number.isFinite(amount) || amount <= 0) {
      setAmountError(
        "Informe um aporte maior que zero, com até duas casas decimais.",
      );
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(contributionAmount)) {
      setAmountError("Use no máximo duas casas decimais.");
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Sua composição de longo prazo
          </CardTitle>
          <CardDescription>
            Ajuste os percentuais por classe. Esta composição é independente das
            metas do assistente de aportes e não é uma recomendação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <StrategyAllocationChart data={chartData} />
          <div className="grid gap-3 sm:grid-cols-2">
            {strategyClasses.map(({ id, label, color }) => {
              const current = currentById.get(id);
              const percentageCents = getPercentageCents(draft[id]);
              const difference =
                percentageCents === null
                  ? null
                  : percentageCents / 100 - currentPercentages[id];
              return (
                <div key={id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    <Label htmlFor={`strategy-${id}`} className="flex-1">
                      {label}
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Atual {currentPercentages[id].toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <Input
                      id={`strategy-${id}`}
                      aria-label={`${label} escolhida (%)`}
                      className="max-w-32 tabular-nums"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={draft[id]}
                      onChange={(event) => updateDraft(id, event.target.value)}
                    />
                    <span className="text-sm tabular-nums">
                      {difference === null
                        ? "Escolha um peso"
                        : `${difference > 0 ? "+" : ""}${difference.toFixed(2)} p.p.`}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {current
                      ? formatCurrencyCents(current.knownValueCents)
                      : "Sem valor classificado"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p
              aria-live="polite"
              className={`text-sm tabular-nums ${percentageSum === 10000 ? "text-foreground" : "text-muted-foreground"}`}
            >
              Soma dos pesos: {(percentageSum / 100).toFixed(2)}%
              {percentageSum < 10000 &&
                ` · faltam ${((10000 - percentageSum) / 100).toFixed(2)}%`}
              {percentageSum > 10000 &&
                ` · excedem ${((percentageSum - 10000) / 100).toFixed(2)}%`}
            </p>
            <Button
              onClick={() => void save()}
              disabled={!targetPercentages || saving}
            >
              {saving ? "Salvando…" : "Salvar composição"}
            </Button>
          </div>
          {!baselineComplete && (
            <Alert>
              <AlertDescription>
                Parte do patrimônio de longo prazo não está classificada ou sem
                valor conhecido. O gráfico mostra os valores identificados; eles
                não são tratados como 100% da carteira.
              </AlertDescription>
            </Alert>
          )}
          {savedAllocationPercentages && (
            <p className="text-xs text-muted-foreground">
              Última composição salva permanece como referência até você salvar
              outra.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visualizar um aporte</CardTitle>
          <CardDescription>
            Simulação informativa sobre posições destinadas ao longo prazo.
            Nenhum investimento será movimentado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full space-y-2 sm:max-w-xs">
              <Label htmlFor="strategy-contribution">Valor do aporte</Label>
              <Input
                id="strategy-contribution"
                inputMode="decimal"
                type="number"
                min="0.01"
                step="0.01"
                value={contributionAmount}
                onChange={(event) => {
                  setContributionAmount(event.target.value);
                  setAmountError(null);
                  setSimulation(null);
                }}
              />
              {amountError && (
                <p className="text-sm text-destructive">{amountError}</p>
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
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">
                {!simulation.completeness.complete
                  ? "Simulação parcial após o aporte"
                  : simulation.completeness.valuationDates.length === 1 &&
                      simulation.completeness.valuationDates[0] ===
                        simulation.completeness.valuationDate
                    ? "Composição estimada após o aporte"
                    : "Simulação aproximada após o aporte"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Valores classificados de longo prazo:{" "}
                {formatCurrencyCents(simulation.totalCents)} · aporte:{" "}
                {formatCurrencyCents(simulation.contributionCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Consulta de {formatDate(simulation.completeness.valuationDate)}
                {simulation.completeness.valuationDates.length > 0 &&
                  ` · valores disponíveis em ${simulation.completeness.valuationDates.map(formatDate).join(", ")}`}
              </p>
              {BigInt(simulation.unallocatedContributionCents) > 0n && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Não distribuído:{" "}
                  {formatCurrencyCents(simulation.unallocatedContributionCents)}
                  . O cálculo não atribuiu esse valor para evitar ultrapassar a
                  composição escolhida.
                </p>
              )}
              {!simulation.completeness.complete && (
                <p className="mt-2 text-sm text-muted-foreground">
                  A simulação não cobre{" "}
                  {simulation.completeness.unvaluedPositionCount} posição(ões)
                  sem valor e{" "}
                  {formatCurrencyCents(
                    simulation.completeness.unclassifiedKnownValueCents,
                  )}{" "}
                  sem classe reconhecida. Avaliação de{" "}
                  {simulation.completeness.valuationDate}.
                </p>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {simulation.allocations.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between gap-2 text-sm"
                  >
                    <span>{item.label}</span>
                    <span className="tabular-nums">
                      {item.projectedPercentage.toFixed(2)}% ·{" "}
                      {formatCurrencyCents(item.contributionValueCents)} do
                      aporte
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
