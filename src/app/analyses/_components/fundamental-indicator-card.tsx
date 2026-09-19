import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AnalysisIndicator } from "./stock-analysis-types";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const names: Record<AnalysisIndicator["key"], string> = {
  pe: "P/L",
  pb: "P/VP",
  roe: "ROE",
  netMargin: "Margem líquida",
};
const help: Record<AnalysisIndicator["key"], string> = {
  pe: "P/L compara o valor de mercado ao lucro líquido das demonstrações financeiras anuais mais recentes. É exibido em vezes, não em percentual.",
  pb: "P/VP compara o valor de mercado ao patrimônio líquido das demonstrações financeiras anuais mais recentes. É exibido em vezes, não em percentual.",
  roe: "ROE mede o lucro líquido anual sobre o patrimônio líquido médio das demonstrações financeiras anuais de dois anos consecutivos.",
  netMargin:
    "Margem líquida divide o lucro líquido pela receita do mesmo demonstrativo. Itens não recorrentes podem alterar a leitura.",
};

export function FundamentalIndicatorCard({
  indicator,
}: {
  indicator: AnalysisIndicator;
}) {
  const usesRatio = indicator.key === "pe" || indicator.key === "pb";
  const value =
    indicator.value === null
      ? "Indisponível"
      : `${indicator.value.toFixed(1)}${usesRatio ? "x" : "%"}`;
  const reference = indicator.referenceDate
    ? `${indicator.sourceDocument === "ITR" ? "Informações trimestrais acumuladas até" : "Demonstrações financeiras anuais encerradas em"} ${dateLabel(indicator.referenceDate)}`
    : indicator.unavailableReason;

  return (
    <article className="rounded-lg border bg-card p-4 shadow-sm transition-shadow motion-safe:hover:shadow-md">
      <div className="flex items-center gap-1.5">
        <h3 className="font-medium">{names[indicator.key]}</h3>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`Ajuda sobre ${names[indicator.key]}`}
            >
              <CircleHelp className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="max-w-xs text-sm leading-relaxed"
            align="start"
          >
            {help[indicator.key]}
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">
        {reference}
      </p>
    </article>
  );
}
