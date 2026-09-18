import { Percent } from "lucide-react";
import type { BcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";
import { Card, CardContent } from "@/components/ui/card";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function ReferenceRates({ rates }: { rates: BcbReferenceRates }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Taxas de referência</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xl font-semibold tracking-tight tabular-nums">
              <Rate label="Selic" rate={rates.selic} />
              <Rate label="CDI" rate={rates.cdi} />
            </div>
          </div>
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Percent className="size-4" />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {rates.selic || rates.cdi
            ? "Taxas anuais oficiais do Banco Central. Cada CDB mostra seu próprio % do CDI na lista de posições."
            : "Taxas oficiais indisponíveis no momento."}
        </p>
      </CardContent>
    </Card>
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
    <span>
      <span className="mr-1 text-sm font-medium text-muted-foreground">
        {label}
      </span>
      {rate ? `${Number(rate.annualRate).toLocaleString("pt-BR")}%` : "—"}
      {rate && (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          em {date.format(new Date(`${rate.date}T00:00:00Z`))}
        </span>
      )}
    </span>
  );
}
