import { Percent } from "lucide-react";
import type { BcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function ReferenceRates({ rates }: { rates: BcbReferenceRates }) {
  const hasRates = rates.selic || rates.cdi;
  return (
    <section
      aria-label="Indicadores de mercado"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border bg-muted/20 px-3 py-2.5 text-sm"
    >
      <span className="flex items-center gap-2 font-medium text-muted-foreground">
        <Percent className="size-3.5 text-primary" />
        Indicadores
      </span>
      <Rate label="Selic" rate={rates.selic} />
      <Rate label="CDI" rate={rates.cdi} />
      {!hasRates && (
        <span className="text-xs text-muted-foreground">
          Taxas oficiais indisponíveis no momento.
        </span>
      )}
    </section>
  );
}

function Rate({
  label,
  rate,
}: {
  label: string;
  rate: BcbReferenceRates["selic"];
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="font-medium text-muted-foreground">
        {rate ? `${Number(rate.annualRate).toLocaleString("pt-BR")}%` : "—"}
      </span>
      {rate && (
        <span className="text-xs text-muted-foreground">
          {date.format(new Date(`${rate.date}T00:00:00Z`))}
        </span>
      )}
    </span>
  );
}
