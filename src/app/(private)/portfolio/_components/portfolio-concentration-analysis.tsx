"use client";

import { useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  type ConcentrationDimension,
  type PortfolioConcentration,
} from "@/lib/portfolio-concentration";
import { portfolioAssetGeographyLabels } from "@/lib/portfolio-classification-options";

type Props = {
  analyses: Record<ConcentrationDimension, PortfolioConcentration>;
};

const dimensions: Array<{ key: ConcentrationDimension; label: string }> = [
  { key: "asset", label: "Ativo" },
  { key: "assetClass", label: "Classe" },
  { key: "subClass", label: "Subclasse" },
  { key: "geography", label: "Geografia" },
];

function formatPercentage(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDateRange(dates: string[]) {
  if (dates.length === 0) return "Não informada";
  const formatDate = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  };
  const first = formatDate(dates[0]);
  const last = formatDate(dates[dates.length - 1]);
  return first === last ? first : `${first} a ${last}`;
}

function displayLabel(label: string) {
  return (
    portfolioAssetGeographyLabels[
      label as keyof typeof portfolioAssetGeographyLabels
    ] ?? label
  );
}

export function PortfolioConcentrationAnalysis({ analyses }: Props) {
  const [dimension, setDimension] =
    useState<ConcentrationDimension>("assetClass");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const analysis = analyses[dimension];
  const largestGroup = analysis.groups[0]!;

  return (
    <section
      className="space-y-5 rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="concentration-heading"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 id="concentration-heading" className="text-base font-semibold">
            Concentração observada
          </h3>
          <Info aria-hidden="true" className="size-4 text-muted-foreground" />
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1 sm:grid-cols-4"
        role="group"
        aria-label="Dimensão da concentração"
      >
        {dimensions.map((item) => (
          <Button
            key={item.key}
            type="button"
            variant={dimension === item.key ? "default" : "ghost"}
            className="w-full"
            aria-pressed={dimension === item.key}
            onClick={() => setDimension(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {analysis.valuedPositions === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          Não há posições com valor disponível para calcular a concentração.{" "}
          {analysis.unvaluedPositions}{" "}
          {analysis.unvaluedPositions === 1 ? "posição está" : "posições estão"}{" "}
          sem valor informado.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">
                Maior participação
              </p>
              <p className="mt-2 truncate text-lg font-semibold tabular-nums">
                {displayLabel(largestGroup.label)} ·{" "}
                {formatPercentage(largestGroup.percentage)}
              </p>
            </div>
            <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Base analisada</p>
              <p className="mt-2 text-lg font-semibold tabular-nums">
                {formatCurrency(analysis.totalValue)}
              </p>
              <p className="text-sm text-muted-foreground">
                {analysis.valuedPositions}{" "}
                {analysis.valuedPositions === 1
                  ? "posição com valor"
                  : "posições com valor"}
              </p>
            </div>
            <div className="min-w-0 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground">Sem valor</p>
              <p className="mt-2 text-lg font-semibold tabular-nums">
                {analysis.unvaluedPositions}{" "}
                {analysis.unvaluedPositions === 1
                  ? "posição excluída"
                  : "posições excluídas"}
              </p>
              <p className="text-sm text-muted-foreground">da base analisada</p>
            </div>
          </div>

          <ul
            className="divide-y rounded-lg border px-4"
            aria-label={`Concentração por ${dimensions.find((item) => item.key === dimension)?.label.toLocaleLowerCase("pt-BR")}`}
          >
            {analysis.groups.map((group) => {
              const percentage = Math.min(100, Math.max(0, group.percentage));
              return (
                <li key={group.label} className="py-4 first:pt-4 last:pb-4">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">
                      {displayLabel(group.label)}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(group.value)} ·{" "}
                      {formatPercentage(percentage)}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${displayLabel(group.label)}: ${formatPercentage(percentage)}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 w-full justify-between px-4 text-left"
            aria-expanded={detailsOpen}
          >
            Base de cálculo e limites
            <ChevronDown
              aria-hidden="true"
              className={
                detailsOpen
                  ? "size-4 rotate-180 transition-transform"
                  : "size-4 transition-transform"
              }
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 rounded-b-lg border border-t-0 px-4 pb-4 pt-3 text-sm text-muted-foreground">
          <p>
            Classificado nesta dimensão:{" "}
            {formatCurrency(analysis.classifiedValue)} (
            {formatPercentage(
              analysis.totalValue > 0 ? analysis.classifiedPercentage : 0,
            )}
            ) em {analysis.classifiedPositions}{" "}
            {analysis.classifiedPositions === 1 ? "posição" : "posições"}. Não
            classificado: {formatCurrency(analysis.unclassifiedValue)} (
            {formatPercentage(
              analysis.totalValue > 0 ? analysis.unclassifiedPercentage : 0,
            )}
            ) em {analysis.unclassifiedPositions}{" "}
            {analysis.unclassifiedPositions === 1 ? "posição" : "posições"}.
          </p>
          <p>
            A participação mostra quanto cada posição ou classificação
            representa do patrimônio com valor disponível. Ela não mede,
            sozinha, a diversificação da carteira. Uma participação maior torna
            o patrimônio mais sensível a variações naquela posição ou grupo,
            mantendo os demais valores iguais; isso não é uma meta nem um sinal
            de compra ou venda.
          </p>
          <p>
            O percentual usa a soma dos valores atuais disponíveis. Nas posições
            importadas, usa a estimativa CDI quando existe; caso contrário, usa
            o valor do registro. Posições manuais usam o valor cadastrado, com
            conversão para reais somente quando informada. Para ativo, o código
            é usado quando disponível; sem ele, são agrupados o nome do produto
            e o emissor registrados. Esses campos não confirmam o instrumento em
            um catálogo.
          </p>
          <p>
            Datas de referência ou atualização dos valores e conversões:{" "}
            {formatDateRange(analysis.referenceDates)}. Os valores podem ter
            datas diferentes e não representam necessariamente um retrato do
            mesmo dia. Posições sem valor ficam fora do denominador e permanecem
            contabilizadas acima.
          </p>
          <p>
            Classe e subclasse podem ser inferidas do produto ou indexador ou
            ajustadas manualmente. Subclasses são agrupadas pelo texto
            cadastrado; grafias diferentes podem aparecer separadas. Geografia é
            informada manualmente, pois a importação não a identifica. Itens sem
            classificação aparecem como não informados. O setor não está
            disponível com cobertura comparável para toda a carteira. A
            composição interna de fundos e ETFs também não é atribuída: essa
            análise depende de uma fonte que identifique os componentes, permita
            atribuí-los às posições e tenha datas compatíveis.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
