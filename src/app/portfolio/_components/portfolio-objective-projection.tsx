"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Calculator, ChevronDown } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { formatCurrency } from "@/lib/utils";
import {
  objectiveProjectionInputSchema,
  simulateObjectiveProjection,
} from "@/lib/objective-projection";
import type { ObjectiveProjectionResult } from "@/lib/objective-projection";
import type { PortfolioObjective } from "./portfolio-objective-card";

type Props = {
  objective: PortfolioObjective | null;
  startingBalance:
    import("@/lib/portfolio-projection-balance").DatedProjectionBalance | null;
};

const maximumProjectionAmount = 1_000_000_000_000;
const defaultAnnualReturnPercent = "12";
const defaultAnnualInflationPercent = "5.14";
const projectionFieldMessages: Record<string, string> = {
  mode: "Escolha o tipo de simulação.",
  targetBasis: "Escolha como deseja entender o valor da meta.",
  startingAmount: "Use um saldo entre R$ 0 e R$ 1 trilhão.",
  targetAmount: "Informe uma meta maior que R$ 0 e até R$ 1 trilhão.",
  horizonYears: "Use um prazo inteiro entre 1 e 100 anos.",
  annualReturnPercent: "Use uma taxa maior que -100% e até 1.000% ao ano.",
  annualInflationPercent: "Use uma taxa maior que -100% e até 1.000% ao ano.",
  monthlyContribution: "Informe um aporte entre R$ 0 e R$ 1 trilhão.",
  adjustContributionsForInflation: "Escolha como aumentar os aportes.",
};

const chartConfig = {
  nominalAmount: {
    label: "Patrimônio nominal",
    color: "var(--chart-category-1)",
  },
  purchasingPowerAmount: {
    label: "Poder de compra de hoje",
    color: "var(--chart-category-4)",
  },
  nominalTargetAmount: {
    label: "Meta nominal",
    color: "var(--chart-category-2)",
  },
  realTargetAmount: {
    label: "Meta em poder de compra de hoje",
    color: "var(--chart-category-3)",
  },
} satisfies ChartConfig;

export function parseProjectionNumber(value: string) {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(/R\$|\s/g, "");
  const parsed = Number(
    normalized.includes(",")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatProjectionAmountInput(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getCurrencySliderStep(maximum: number) {
  if (maximum <= 1_000) return 1;
  if (maximum <= 100_000) return 100;
  if (maximum <= 1_000_000) return 1_000;
  if (maximum <= 100_000_000) return 10_000;
  return 100_000;
}

function formatAxis(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function dateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(parsed);
}

function rateSliderRange(value: string) {
  const parsed = parseProjectionNumber(value);
  if (parsed === null) return null;
  return {
    min: Math.max(-99.99, parsed - 5),
    max: Math.min(1_000, parsed + 5),
  };
}

export function formatProjectionYearLabel(year: unknown) {
  return `Ano ${year}`;
}

export function formatProjectionCurrency(value: unknown) {
  return formatCurrency(Number(value));
}

export function getProjectionCalculationFailureMessage(error: unknown) {
  if (!(error instanceof RangeError)) throw error;
  return "As premissas geram um valor fora do limite que podemos calcular.";
}

export function PortfolioObjectiveProjection({
  objective,
  startingBalance,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState("project_balance");
  const [targetBasis, setTargetBasis] = useState("future_nominal");
  const [targetAmount, setTargetAmount] = useState(
    (objective?.targetAmount ?? 1_000_000).toString(),
  );
  const [targetSliderMax, setTargetSliderMax] = useState(
    Math.min(
      maximumProjectionAmount,
      Math.max(1, (objective?.targetAmount ?? 1_000_000) * 2),
    ),
  );
  const [horizonYears, setHorizonYears] = useState("10");
  const [annualReturnPercent, setAnnualReturnPercent] = useState(
    defaultAnnualReturnPercent,
  );
  const [annualInflationPercent, setAnnualInflationPercent] = useState(
    defaultAnnualInflationPercent,
  );
  const [returnSliderRange, setReturnSliderRange] = useState<{
    min: number;
    max: number;
  } | null>(() => rateSliderRange(defaultAnnualReturnPercent));
  const [inflationSliderRange, setInflationSliderRange] = useState<{
    min: number;
    max: number;
  } | null>(() => rateSliderRange(defaultAnnualInflationPercent));
  const [startingAmount, setStartingAmount] = useState(
    startingBalance?.amount.toString() ?? "",
  );
  const [startingSliderMax, setStartingSliderMax] = useState(
    Math.min(
      maximumProjectionAmount,
      Math.max(1, (startingBalance?.amount ?? 0) * 2),
    ),
  );
  const [monthlyContribution, setMonthlyContribution] = useState(
    (objective?.monthlyPlannedAmount ?? 0).toString(),
  );
  const [contributionSliderMax, setContributionSliderMax] = useState(
    Math.min(
      maximumProjectionAmount,
      Math.max(1, (objective?.monthlyPlannedAmount ?? 0) * 2),
    ),
  );
  const [contributionAdjustment, setContributionAdjustment] = useState("fixed");

  function updateInput(setValue: (value: string) => void, value: string) {
    setValue(value);
  }

  const starting = parseProjectionNumber(startingAmount);
  const target = parseProjectionNumber(targetAmount);
  const years = parseProjectionNumber(horizonYears);
  const annualReturn = parseProjectionNumber(annualReturnPercent);
  const inflation = parseProjectionNumber(annualInflationPercent);
  const contribution = parseProjectionNumber(monthlyContribution);
  const projectionInput = useMemo(
    () =>
      objectiveProjectionInputSchema.safeParse({
        mode,
        targetBasis,
        startingAmount: starting,
        targetAmount: target,
        horizonYears: years,
        annualReturnPercent: annualReturn,
        annualInflationPercent: inflation,
        monthlyContribution: mode === "project_balance" ? contribution : null,
        adjustContributionsForInflation: contributionAdjustment === "adjust",
      }),
    [
      mode,
      targetBasis,
      starting,
      target,
      years,
      annualReturn,
      inflation,
      contribution,
      contributionAdjustment,
    ],
  );
  const projectionErrors = projectionInput.success
    ? {}
    : Object.fromEntries(
        projectionInput.error.issues.map((issue) => [
          String(issue.path[0]),
          projectionFieldMessages[String(issue.path[0])],
        ]),
      );
  const displayableProjectionErrors = Object.fromEntries(
    Object.entries(projectionErrors).filter(([field]) => {
      const fieldValues: Record<string, string> = {
        mode,
        targetBasis,
        startingAmount,
        targetAmount,
        horizonYears,
        annualReturnPercent,
        annualInflationPercent,
        monthlyContribution,
        adjustContributionsForInflation: contributionAdjustment,
      };
      return Boolean(fieldValues[field]);
    }),
  );
  const hasSelectedAssumptions = Boolean(
    mode && targetBasis && contributionAdjustment,
  );
  const parsedProjectionInput = projectionInput.success
    ? projectionInput.data
    : null;
  const projection = useMemo(() => {
    if (!hasSelectedAssumptions || !parsedProjectionInput) {
      return null;
    }
    try {
      return {
        result: simulateObjectiveProjection(parsedProjectionInput),
        error: null,
      };
    } catch (error) {
      return {
        result: null,
        error: getProjectionCalculationFailureMessage(error),
      };
    }
  }, [hasSelectedAssumptions, parsedProjectionInput]);
  const result = projection?.result ?? null;
  const error = projection?.error ?? null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator aria-hidden="true" className="size-4 text-primary" />
              {objective ? `Planejar ${objective.name}` : "Planejar patrimônio"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ajuste os valores e veja a projeção mudar.
            </p>
          </div>
          <Badge variant="outline">Cenário hipotético</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {startingBalance ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {startingBalance.source === "objective"
                ? "Valor deste objetivo"
                : startingBalance.completeness === "complete"
                  ? "Patrimônio conhecido"
                  : "Patrimônio conhecido (parcial)"}
              : {formatCurrency(startingBalance.amount)}
              {startingBalance.referenceDate &&
                ` · dados de ${dateLabel(startingBalance.referenceDate)}`}
            </p>
            {startingBalance.source === "portfolio" &&
              startingBalance.completeness === "complete" && (
                <p className="text-xs text-muted-foreground">
                  O cenário considera o patrimônio conhecido da carteira, sem
                  alterar sua distribuição na plataforma.
                </p>
              )}
            {startingBalance.source === "portfolio" &&
              startingBalance.completeness === "partial" && (
                <p className="text-xs text-status-warning">
                  Saldo parcial: soma valores conhecidos; há posições sem valor
                  ou sem data-base única.
                </p>
              )}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {objective
              ? "Saldo deste objetivo incompleto. Escolha Patrimônio total ou informe um saldo inicial."
              : "Patrimônio total incompleto. Informe um saldo inicial para simular."}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="O que quer simular" id="projection-mode">
            <Select
              value={mode}
              onValueChange={(value) => updateInput(setMode, value)}
            >
              <SelectTrigger
                id="projection-mode"
                aria-label="O que quer simular"
              >
                <SelectValue placeholder="Escolha uma simulação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_balance">
                  Quanto posso acumular?
                </SelectItem>
                <SelectItem value="required_contribution">
                  Quanto preciso aportar?
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <RangeField
            label="Meta"
            id="projection-target"
            value={targetAmount}
            min={0.01}
            max={maximumProjectionAmount}
            sliderMin={0}
            sliderMax={targetSliderMax}
            sliderStep={getCurrencySliderStep(targetSliderMax)}
            currency
            placeholder="Valor desejado"
            sliderDisabled={!targetAmount}
            error={displayableProjectionErrors.targetAmount}
            onChange={(value) => {
              updateInput(setTargetAmount, value);
              setTargetSliderMax(
                Math.min(
                  maximumProjectionAmount,
                  Math.max(1, (parseProjectionNumber(value) ?? 0) * 2),
                ),
              );
            }}
            onSlide={(value) => updateInput(setTargetAmount, value)}
          />
          <RangeField
            label="Prazo em anos"
            id="projection-years"
            value={horizonYears}
            min={1}
            max={100}
            sliderMin={1}
            sliderMax={100}
            sliderStep={1}
            placeholder="Informe o prazo"
            inputMode="numeric"
            sliderDisabled={!horizonYears}
            error={displayableProjectionErrors.horizonYears}
            onChange={(value) => updateInput(setHorizonYears, value)}
            onSlide={(value) => updateInput(setHorizonYears, value)}
          />
          <RangeField
            label="Rendimento anual (%)"
            id="projection-return"
            value={annualReturnPercent}
            min={-99.99}
            max={1_000}
            sliderMin={returnSliderRange?.min ?? 0}
            sliderMax={returnSliderRange?.max ?? 1}
            sliderStep={0.1}
            placeholder="Ex.: 8"
            sliderDisabled={!returnSliderRange}
            error={displayableProjectionErrors.annualReturnPercent}
            onChange={(value) => {
              updateInput(setAnnualReturnPercent, value);
              setReturnSliderRange(rateSliderRange(value));
            }}
            onSlide={(value) => updateInput(setAnnualReturnPercent, value)}
          />
          <RangeField
            label="Saldo inicial"
            id="projection-starting-amount"
            value={startingAmount}
            min={0}
            max={maximumProjectionAmount}
            sliderMin={0}
            sliderMax={startingSliderMax}
            sliderStep={getCurrencySliderStep(startingSliderMax)}
            currency
            placeholder="Saldo atual"
            sliderDisabled={!startingAmount}
            error={displayableProjectionErrors.startingAmount}
            onChange={(value) => {
              updateInput(setStartingAmount, value);
              setStartingSliderMax(
                Math.min(
                  maximumProjectionAmount,
                  Math.max(1, (parseProjectionNumber(value) ?? 0) * 2),
                ),
              );
            }}
            onSlide={(value) => updateInput(setStartingAmount, value)}
          />
          <RangeField
            label="Inflação anual (%)"
            id="projection-inflation"
            value={annualInflationPercent}
            min={-99.99}
            max={1_000}
            sliderMin={inflationSliderRange?.min ?? 0}
            sliderMax={inflationSliderRange?.max ?? 1}
            sliderStep={0.1}
            placeholder="Ex.: 4"
            sliderDisabled={!inflationSliderRange}
            error={displayableProjectionErrors.annualInflationPercent}
            onChange={(value) => {
              updateInput(setAnnualInflationPercent, value);
              setInflationSliderRange(rateSliderRange(value));
            }}
            onSlide={(value) => updateInput(setAnnualInflationPercent, value)}
          />
          <Field label="Valor da meta representa" id="projection-basis">
            <Select
              value={targetBasis}
              onValueChange={(value) => updateInput(setTargetBasis, value)}
            >
              <SelectTrigger
                id="projection-basis"
                aria-label="Valor da meta representa"
              >
                <SelectValue placeholder="Escolha o poder de compra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="future_nominal">Valor futuro</SelectItem>
                <SelectItem value="today_purchasing_power">
                  Poder de compra de hoje
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Aporte aumenta?" id="projection-adjustment">
            <Select
              value={contributionAdjustment}
              onValueChange={(value) =>
                updateInput(setContributionAdjustment, value)
              }
            >
              <SelectTrigger
                id="projection-adjustment"
                aria-label="Aporte aumenta?"
              >
                <SelectValue placeholder="Escolha uma opção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Manter valor</SelectItem>
                <SelectItem value="adjust">Aumentar pela inflação</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <RangeField
            label="Aporte mensal"
            id="projection-contribution"
            value={monthlyContribution}
            min={0}
            max={maximumProjectionAmount}
            sliderMin={0}
            sliderMax={contributionSliderMax}
            sliderStep={getCurrencySliderStep(contributionSliderMax)}
            currency
            placeholder={
              mode === "required_contribution"
                ? "Calculado pela simulação"
                : "Informe o aporte"
            }
            disabled={mode === "required_contribution"}
            sliderDisabled={
              !monthlyContribution || mode === "required_contribution"
            }
            error={displayableProjectionErrors.monthlyContribution}
            onChange={(value) => {
              updateInput(setMonthlyContribution, value);
              setContributionSliderMax(
                Math.min(
                  maximumProjectionAmount,
                  Math.max(1, (parseProjectionNumber(value) ?? 0) * 2),
                ),
              );
            }}
            onSlide={(value) => updateInput(setMonthlyContribution, value)}
          />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between px-2 text-muted-foreground"
            >
              Sobre o cálculo
              <ChevronDown aria-hidden="true" className="size-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>
              O retorno inicial de 12% é uma hipótese editável, não uma média ou
              recomendação. A inflação inicia em 5,14%, média do IPCA de
              2016–2025; é uma referência histórica, não uma previsão. O cálculo
              não considera impostos nem taxas.
            </p>
          </CollapsibleContent>
        </Collapsible>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {result ? (
          <ProjectionResult result={result} reducedMotion={reducedMotion} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Informe um saldo inicial para ver a projeção.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function RangeField({
  label,
  id,
  value,
  min,
  max,
  sliderMin,
  sliderMax,
  sliderStep,
  placeholder,
  inputMode = "decimal",
  currency = false,
  disabled = false,
  sliderDisabled = false,
  error,
  onChange,
  onSlide,
}: {
  label: string;
  id: string;
  value: string;
  min: number;
  max: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  placeholder: string;
  inputMode?: "decimal" | "numeric";
  currency?: boolean;
  disabled?: boolean;
  sliderDisabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
  onSlide: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const parsed = parseProjectionNumber(value);
  const sliderValue = Math.min(
    sliderMax,
    Math.max(sliderMin, parsed ?? sliderMin),
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {currency && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            R$
          </span>
        )}
        <Input
          id={id}
          type={currency ? "text" : "number"}
          min={currency ? undefined : min}
          max={currency ? undefined : max}
          step={currency ? undefined : "any"}
          inputMode={currency ? "decimal" : inputMode}
          value={
            currency && !isEditing ? formatProjectionAmountInput(parsed) : value
          }
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={currency ? "pl-10 tabular-nums" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Slider
        aria-label={`${label}, controle deslizante`}
        value={[sliderValue]}
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        disabled={disabled || sliderDisabled}
        onValueChange={(nextValue) => {
          const value = nextValue[0];
          onSlide(
            String(
              Number(value.toFixed(currency ? 2 : sliderStep < 1 ? 1 : 0)),
            ),
          );
        }}
      />
    </div>
  );
}

function ProjectionResult({
  result,
  reducedMotion,
}: {
  result: ObjectiveProjectionResult;
  reducedMotion: boolean;
}) {
  const primaryValue =
    result.mode === "required_contribution"
      ? result.requiredMonthlyContribution!
      : result.projectedNominalAmount;
  const primaryLabel =
    result.mode === "required_contribution"
      ? result.adjustContributionsForInflation
        ? "Aporte mensal inicial necessário"
        : "Aporte mensal necessário"
      : "Patrimônio nominal projetado";
  const realValue = result.projectedPurchasingPowerAmount;

  return (
    <section
      aria-label="Resultado da simulação"
      className="space-y-4 border-t pt-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {result.mode === "required_contribution" ? (
          <>
            <ResultMetric
              label={primaryLabel}
              value={formatCurrency(primaryValue)}
              emphasized
              description={
                result.mode === "required_contribution" &&
                result.adjustContributionsForInflation
                  ? "Valor do primeiro mês; reajuste anual pela inflação escolhida."
                  : undefined
              }
            />
            <ResultMetric
              label="Patrimônio nominal projetado"
              value={formatCurrency(result.projectedNominalAmount)}
            />
            <ResultMetric
              label="Patrimônio em poder de compra de hoje"
              value={formatCurrency(realValue)}
            />
          </>
        ) : (
          <>
            <ResultMetric
              label="Patrimônio nominal projetado"
              value={formatCurrency(result.projectedNominalAmount)}
              emphasized
            />
            <ResultMetric
              label="Patrimônio em poder de compra de hoje"
              value={formatCurrency(realValue)}
            />
          </>
        )}
      </div>
      <div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-category-1)]" />
            Patrimônio nominal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--chart-category-4)]" />
            Patrimônio real
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-[var(--chart-category-2)]" />
            Meta nominal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-[var(--chart-category-3)]" />
            Meta real
          </span>
        </div>
        <ChartContainer
          config={chartConfig}
          className="h-56 w-full aspect-auto"
          aria-label="Gráfico com projeção nominal e em poder de compra de hoje"
        >
          <AreaChart
            accessibilityLayer
            data={result.points}
            margin={{ left: 8, right: 12, top: 12, bottom: 4 }}
          >
            <defs>
              <linearGradient
                id="projection-nominal-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-nominalAmount)"
                  stopOpacity={0.22}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-nominalAmount)"
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient
                id="projection-real-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-purchasingPowerAmount)"
                  stopOpacity={0.12}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-purchasingPowerAmount)"
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(year: number) => `${year}a`}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={formatAxis}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={formatProjectionYearLabel}
                  formatter={formatProjectionCurrency}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="nominalAmount"
              stroke="var(--color-nominalAmount)"
              strokeWidth={2}
              fill="url(#projection-nominal-fill)"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={!reducedMotion}
              animationDuration={220}
            />
            <Area
              type="monotone"
              dataKey="purchasingPowerAmount"
              stroke="var(--color-purchasingPowerAmount)"
              strokeWidth={2}
              fill="url(#projection-real-fill)"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={!reducedMotion}
              animationDuration={220}
            />
            <Line
              type="monotone"
              dataKey="nominalTargetAmount"
              stroke="var(--color-nominalTargetAmount)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="realTargetAmount"
              stroke="var(--color-realTargetAmount)"
              strokeDasharray="2 4"
              strokeWidth={1.5}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Cenário matemático baseado nas premissas escolhidas. Retorno e inflação
        podem variar.
      </p>
    </section>
  );
}

function ResultMetric({
  label,
  value,
  emphasized = false,
  description,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  description?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${emphasized ? "border-primary/30 bg-primary/5" : "bg-card"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
