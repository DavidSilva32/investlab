import { Percent } from "lucide-react";
import type { BcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";
import { Card, CardContent } from "@/components/ui/card";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function ReferenceRates({ rates }: { rates: BcbReferenceRates }) {
  const hasRates = rates.selic || rates.cdi;
  return (
    <Card>
      <section aria-label="Indicadores de mercado">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-[minmax(8rem,0.55fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:col-span-2 lg:col-span-1">
            <Percent aria-hidden="true" className="size-4 text-primary" />
            Indicadores
          </h2>
          <Rate label="Selic" rate={rates.selic} />
          <Rate label="CDI" rate={rates.cdi} className="sm:border-l sm:pl-5" />
          {!hasRates && (
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
              Taxas oficiais indisponíveis no momento.
            </p>
          )}
        </CardContent>
      </section>
    </Card>
  );
}

function Rate({
  label,
  rate,
  className = "",
}: {
  label: string;
  rate: BcbReferenceRates["selic"];
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-3 sm:border-t-0 sm:pt-0 ${className}`}
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {rate ? `${Number(rate.annualRate).toLocaleString("pt-BR")}%` : "—"}
      </span>
      {rate && (
        <span className="text-xs text-muted-foreground">
          {label === "Selic" ? "Vigente até" : "Referência"}:{" "}
          {date.format(new Date(`${rate.date}T00:00:00Z`))}
        </span>
      )}
    </div>
  );
}
