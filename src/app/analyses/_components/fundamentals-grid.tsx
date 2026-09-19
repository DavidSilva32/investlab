import type { AnalysisPeriod } from "./stock-analysis-types";

const compact = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

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
        {type === "DFP" ? "Sem DFP anual disponível." : "Sem ITR disponível."}
      </div>
    );

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {periods.map((period) => (
        <article
          key={`${period.sourceDocument}-${period.referenceDate}`}
          className="rounded-lg border bg-card p-4 shadow-sm"
        >
          <h3 className="font-medium">
            {type === "ITR" ? "Acumulado até " : ""}
            {dateLabel(period.referenceDate)}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <FundamentalValue label="Receita" value={period.revenue} />
            <FundamentalValue label="Lucro líquido" value={period.netIncome} />
            <FundamentalValue label="Patrimônio" value={period.equity} />
          </dl>
        </article>
      ))}
    </div>
  );
}

function FundamentalValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value === null ? "—" : compact.format(Number(value))}
      </dd>
    </div>
  );
}
