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
const help: Record<
  AnalysisIndicator["key"],
  { definition: string; reading: string; caution: string }
> = {
  pe: {
    definition:
      "Compara o valor de mercado da empresa com o lucro líquido anual: quantos anos desse lucro equivalem ao preço atual, em uma simplificação.",
    reading:
      "Um P/L maior pode refletir expectativas de crescimento; um menor pode indicar preço mais baixo em relação ao lucro.",
    caution:
      "Lucro negativo torna a relação pouco útil. Compare empresas do mesmo setor e considere dívida, ciclo e itens não recorrentes.",
  },
  pb: {
    definition:
      "Compara o valor de mercado com o patrimônio líquido contábil da empresa.",
    reading:
      "Um P/VP maior indica preço mais alto em relação ao patrimônio; um menor pode refletir desconto ou riscos percebidos.",
    caution:
      "O patrimônio contábil não mede sozinho o valor dos ativos ou a capacidade de gerar lucro. Setor e composição do balanço importam.",
  },
  roe: {
    definition:
      "Relaciona o lucro líquido anual ao patrimônio líquido médio entre o início e o fim do exercício.",
    reading:
      "Um ROE maior mostra mais lucro em relação ao patrimônio usado; um menor pode indicar retorno mais baixo nesse período.",
    caution:
      "Dívida, patrimônio muito pequeno ou negativo e ganhos não recorrentes podem distorcer a taxa. Verifique vários exercícios.",
  },
  netMargin: {
    definition:
      "É a parcela da receita que resta como lucro líquido no mesmo demonstrativo.",
    reading:
      "Uma margem maior indica mais lucro por unidade de receita; uma menor pode refletir custos, despesas ou pressão competitiva.",
    caution:
      "Margens variam muito entre setores. Itens não recorrentes e demonstrativos intermediários acumulados afetam a comparação.",
  },
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
  const explanation = help[indicator.key];

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
            className="max-w-sm space-y-2 text-sm leading-relaxed"
            align="start"
          >
            <p>
              <span className="font-medium">O que mede: </span>
              {explanation.definition}
            </p>
            <p>
              <span className="font-medium">Como ler: </span>
              {explanation.reading}
            </p>
            <p>
              <span className="font-medium">Cuidado: </span>
              {explanation.caution}
            </p>
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
