import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalysisPeriod } from "./stock-analysis-types";

const exact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

const changeMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const changePercent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  signDisplay: "exceptZero",
  maximumFractionDigits: 1,
});

type Metric = "revenue" | "netIncome";
type Movement = {
  direction: "up" | "down" | "same";
  difference: number;
  percent: string | null;
  previous: string;
  current: string;
};

function numericValue(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function annualMovement(
  periods: AnalysisPeriod[],
  current: AnalysisPeriod,
  metric: Metric,
): Movement | null {
  const currentYear = Number(current.referenceDate.slice(0, 4));
  const anchor = current.referenceDate.slice(5);
  const previousPeriods = periods.filter(
    (period) =>
      period.sourceDocument === "DFP" &&
      Number(period.referenceDate.slice(0, 4)) === currentYear - 1 &&
      period.referenceDate.slice(5) === anchor,
  );
  if (previousPeriods.length !== 1) return null;
  const previous = previousPeriods[0];

  const previousValue = numericValue(previous[metric]);
  const currentValue = numericValue(current[metric]);
  if (previousValue === null || currentValue === null) return null;

  const difference = currentValue - previousValue;
  return {
    direction:
      currentValue > previousValue
        ? "up"
        : currentValue < previousValue
          ? "down"
          : "same",
    difference,
    percent:
      previousValue > 0
        ? changePercent.format(difference / previousValue)
        : null,
    previous: previous.referenceDate.slice(0, 4),
    current: current.referenceDate.slice(0, 4),
  };
}

export function FundamentalsGrid({
  periods,
  type,
}: {
  periods: AnalysisPeriod[];
  type: "DFP" | "ITR";
}) {
  if (!periods.length)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        {type === "DFP"
          ? "Não há resultados anuais disponíveis."
          : "Não há atualizações financeiras disponíveis durante o ano."}
      </div>
    );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((period, index) => (
        <article
          key={`${period.sourceDocument}-${period.referenceDate}-${index}`}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <h3 className="font-medium">
            {periodLabelPrefix(period, type)}
            {dateLabel(period.referenceDate)}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <FundamentalValue
              label={flowLabel("Receita", period, type)}
              value={period.revenue}
              movement={
                type === "DFP"
                  ? annualMovement(periods, period, "revenue")
                  : null
              }
            />
            <FundamentalValue
              label={flowLabel("Lucro líquido", period, type)}
              value={period.netIncome}
              movement={
                type === "DFP"
                  ? annualMovement(periods, period, "netIncome")
                  : null
              }
              colorSign={type === "ITR"}
            />
            <FundamentalValue
              label={`Patrimônio líquido (saldo em ${dateLabel(period.referenceDate)})`}
              value={period.equity}
              movement={null}
            />
          </dl>
        </article>
      ))}
    </div>
  );
}

function flowLabel(
  label: "Receita" | "Lucro líquido",
  period: AnalysisPeriod,
  type: "DFP" | "ITR",
) {
  if (type === "DFP") return label;
  if (
    period.exerciseOrder === "previous" &&
    period.periodBasis === "year_to_date"
  )
    return `${label} no mesmo período do ano anterior`;
  const periodDescription =
    period.periodBasis === "year_to_date"
      ? label === "Receita"
        ? "acumulada no ano"
        : "acumulado no ano"
      : period.periodBasis === "quarterly"
        ? "do trimestre"
        : "em período não informado";
  return `${label} ${periodDescription}`;
}

function periodLabelPrefix(period: AnalysisPeriod, type: "DFP" | "ITR") {
  if (type === "DFP") return "";
  if (period.exerciseOrder === "previous")
    return "Mesmo período do ano anterior até ";
  if (period.periodBasis === "quarterly") return "Trimestre encerrado em ";
  if (period.periodBasis === "year_to_date") return "Acumulado no ano até ";
  return "Informações publicadas em ";
}

function FundamentalValue({
  label,
  value,
  movement,
  colorSign = false,
}: {
  label: string;
  value: string | null;
  movement: Movement | null;
  colorSign?: boolean;
}) {
  const parsed = numericValue(value);
  const signTone =
    !colorSign || parsed === null || parsed === 0
      ? ""
      : parsed > 0
        ? "text-status-success"
        : "text-status-danger";
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right font-medium tabular-nums">
        <span className={signTone}>
          {parsed === null ? "—" : exact.format(parsed)}
        </span>
        {movement && <MovementBadge movement={movement} />}
      </dd>
    </div>
  );
}

function MovementBadge({ movement }: { movement: Movement }) {
  const Icon =
    movement.direction === "up"
      ? TrendingUp
      : movement.direction === "down"
        ? TrendingDown
        : Minus;
  const tone =
    movement.direction === "up"
      ? "text-status-info"
      : movement.direction === "down"
        ? "text-status-warning"
        : "text-muted-foreground";
  const label =
    movement.direction === "up"
      ? "Aumentou"
      : movement.direction === "down"
        ? "Diminuiu"
        : "Sem variação";
  const detail =
    movement.direction === "same"
      ? ""
      : `${changeMoney.format(Math.abs(movement.difference))}${movement.percent ? ` (${movement.percent})` : ""}`;
  const accessibleDetail = detail || `Mesmo valor: ${changeMoney.format(0)}`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-normal ${tone}`}
      aria-label={`${label} entre ${movement.previous} e ${movement.current}: ${accessibleDetail}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
      {detail ? ` ${detail}` : ""}
    </span>
  );
}
