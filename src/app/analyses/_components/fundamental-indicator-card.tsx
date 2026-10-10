import { CheckCircle2, CircleHelp, CircleX, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { StockCriterionResult } from "@/lib/stock-criteria-evaluation";
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
const metricNumber = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const names: Record<AnalysisIndicator["key"], string> = {
  pe: "P/L",
  pb: "P/VP",
  roe: "ROE",
  netMargin: "Margem Líquida",
};
const unavailableMessages: Record<AnalysisIndicator["key"], string> = {
  pe: "Faltam dados compatíveis de preço e lucro.",
  pb: "Faltam dados compatíveis de preço e patrimônio.",
  roe: "Faltam dados compatíveis de lucro e patrimônio.",
  netMargin: "Faltam dados compatíveis de receita e lucro.",
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
      "A margem varia entre setores e mostra lucro em relação à receita.",
    caution:
      "Ganhos fora do comum e períodos parciais podem afetar o resultado.",
  },
};

function statusFor(
  indicator: AnalysisIndicator,
  criterion: StockCriterionResult | undefined,
  stale: boolean,
  notApplicableReason: string | null | undefined,
) {
  if (notApplicableReason || criterion?.status === "not_applicable")
    return {
      label: "Não aplicável",
      className: "text-muted-foreground",
      Icon: MinusCircle,
    };
  if (stale)
    return {
      label: "Desatualizado",
      className: "text-status-warning",
      Icon: CircleHelp,
    };
  if (criterion?.status === "meets")
    return {
      label: "Dentro do limite",
      className: "text-status-success",
      Icon: CheckCircle2,
    };
  if (criterion?.status === "fails")
    return {
      label: "Fora do limite",
      className: "text-status-warning",
      Icon: CircleX,
    };
  if (criterion)
    return {
      label:
        criterion.reason === "threshold_not_configured"
          ? "Sem limite"
          : "Sem dados",
      className: "text-muted-foreground",
      Icon: CircleHelp,
    };
  return indicator.value === null
    ? {
        label: "Sem dados",
        className: "text-muted-foreground",
        Icon: CircleHelp,
      }
    : {
        label: "Informativo",
        className: "text-muted-foreground",
        Icon: CircleHelp,
      };
}

function criterionExplanation(
  result: StockCriterionResult | undefined,
  indicator: AnalysisIndicator,
  stale: boolean,
  notApplicableReason: string | null | undefined,
) {
  if (notApplicableReason) return notApplicableReason;
  if (stale)
    return "O valor mais recente permanece visível, mas não é usado para avaliar limites enquanto os dados estiverem desatualizados.";
  if (!result)
    return "Indicador exibido para consulta, sem limite de avaliação configurado.";
  if (result.threshold !== null)
    return indicator.key === "roe"
      ? `Referência configurada: mínimo de ${result.threshold}%.`
      : `Referência configurada: máximo de ${result.threshold}x.`;
  switch (result.reason) {
    case "threshold_not_configured":
      return "Defina um limite nas configurações para avaliar este múltiplo.";
    case "financial_sector_methodology_required":
      return "A metodologia atual não compara este indicador neste setor.";
    case "financial_roe_requires_ltm":
      return "Para bancos, o ROE só é comparado com lucro dos últimos 12 meses.";
    case "positive_equity_required":
      return "É necessário patrimônio líquido positivo para avaliar o ROE.";
    case "market_data_date_required":
      return "A data da cotação usada no múltiplo não está disponível.";
    case "positive_multiple_required":
      return "O múltiplo precisa ser positivo para comparação.";
    default:
      return indicator.value === null
        ? unavailableMessages[indicator.key]
        : "Os dados disponíveis não permitem aplicar este limite.";
  }
}

export function FundamentalIndicatorCard({
  indicator,
  criterion,
  stale = false,
  notApplicableReason,
}: {
  indicator: AnalysisIndicator;
  criterion?: StockCriterionResult;
  stale?: boolean;
  notApplicableReason?: string | null;
}) {
  const usesRatio = indicator.key === "pe" || indicator.key === "pb";
  const value =
    indicator.value === null
      ? "Indisponível"
      : `${metricNumber.format(indicator.value)}${usesRatio ? "x" : "%"}`;
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
  const status = statusFor(indicator, criterion, stale, notApplicableReason);
  const StatusIcon = status.Icon;
  const details = criterionExplanation(
    criterion,
    indicator,
    stale,
    notApplicableReason,
  );

  return (
    <article
      role="listitem"
      aria-label={`${names[indicator.key]}: ${value}${criterion?.threshold ? `, referência ${metricNumber.format(criterion.threshold)}${usesRatio ? "x" : "%"}` : ""}, ${status.label}`}
      className="rounded-lg border bg-card p-3 shadow-sm transition-colors motion-safe:hover:border-primary/30"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate font-medium">{names[indicator.key]}</h3>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={`Ajuda sobre ${names[indicator.key]}`}
              >
                <CircleHelp className="size-3.5" aria-hidden="true" />
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
              <p className="border-t pt-2 text-muted-foreground">{details}</p>
              <p className="text-xs text-muted-foreground">{reference}</p>
              <p className="text-xs text-muted-foreground">
                Base: demonstrações públicas da CVM.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${status.className}`}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {criterion?.threshold !== null &&
        criterion?.threshold !== undefined &&
        !stale
          ? indicator.key === "roe"
            ? `Mín. ${metricNumber.format(criterion.threshold)}%`
            : `Máx. ${metricNumber.format(criterion.threshold)}x`
          : indicator.value === null
            ? unavailableMessages[indicator.key]
            : reference}
      </p>
    </article>
  );
}
