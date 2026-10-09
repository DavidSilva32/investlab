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
const dateTimeLabel = (value: string) => {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(timestamp)
    : null;
};
const names: Record<AnalysisIndicator["key"], string> = {
  pe: "Preço em relação ao lucro",
  pb: "Preço em relação ao patrimônio",
  roe: "Retorno do patrimônio",
  netMargin: "Margem de lucro",
};
const unavailableMessages: Record<AnalysisIndicator["key"], string> = {
  pe: "Não há dados suficientes de preço e lucro para este indicador.",
  pb: "Não há dados suficientes de preço e patrimônio para este indicador.",
  roe: "Não há dados suficientes de lucro e patrimônio ao longo do tempo.",
  netMargin: "Não há dados suficientes de receita e lucro para este indicador.",
};
const help: Record<
  AnalysisIndicator["key"],
  { definition: string; reading: string; caution: string }
> = {
  pe: {
    definition:
      "Compara o valor de mercado da empresa com o lucro dos últimos 12 meses quando há dados compatíveis; sem essa base, usa o resultado anual mais recente.",
    reading:
      "Um valor mais alto pode refletir expectativas de crescimento; um menor pode indicar preço mais baixo em relação ao lucro.",
    caution:
      "Se a empresa teve prejuízo, essa comparação pode ajudar menos. Considere também o setor, as dívidas e resultados fora do comum.",
  },
  pb: {
    definition:
      "Compara o valor de mercado da empresa com o patrimônio informado na data mais recente.",
    reading:
      "Um valor maior indica preço mais alto em relação ao patrimônio; um menor pode refletir desconto ou riscos percebidos.",
    caution:
      "O patrimônio informado não mostra sozinho o valor dos bens ou a capacidade de gerar lucro. O setor e as dívidas também importam.",
  },
  roe: {
    definition:
      "Compara o lucro do período com o patrimônio médio da empresa entre as datas informadas.",
    reading:
      "Um valor maior mostra mais lucro em relação ao patrimônio considerado; um menor indica retorno mais baixo nesse período.",
    caution:
      "Dívidas, patrimônio muito pequeno ou negativo e ganhos fora do comum podem afetar o resultado. Compare vários anos.",
  },
  netMargin: {
    definition:
      "Mostra quanto da receita da empresa restou como lucro no mesmo período.",
    reading:
      "Uma margem maior indica mais lucro por unidade de receita; uma menor pode refletir custos, despesas ou pressão competitiva.",
    caution:
      "A margem varia muito entre setores. Custos, ganhos fora do comum e períodos parciais também afetam a comparação.",
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
  const periodLabel =
    indicator.periodBasis === "trailing_twelve_months"
      ? "Últimos 12 meses até"
      : indicator.periodBasis === "year_to_date"
        ? "Acumulado no ano até"
        : indicator.periodBasis === "point_in_time"
          ? "Saldo informado em"
          : indicator.periodBasis === "quarterly"
            ? "Trimestre encerrado em"
            : indicator.sourceDocument === "ITR"
              ? "Acumulado no ano até"
              : "Ano encerrado em";
  const fundamentalsReference = indicator.referenceDate
    ? `${periodLabel} ${dateLabel(indicator.referenceDate)}`
    : unavailableMessages[indicator.key];
  const marketReference = usesRatio
    ? indicator.marketDataDate
      ? dateTimeLabel(indicator.marketDataDate)
        ? `Cotação observada em ${dateTimeLabel(indicator.marketDataDate)}`
        : "Data da cotação não informada"
      : "Data da cotação não informada"
    : null;
  const reference = [fundamentalsReference, marketReference]
    .filter(Boolean)
    .join(" · ");
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
