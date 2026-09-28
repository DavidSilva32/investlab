"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  getPortfolioConcentration,
  type ConcentrationDimension,
  type PortfolioConcentrationPosition,
} from "@/lib/portfolio-concentration";
import { portfolioAssetGeographyLabels } from "@/lib/portfolio-classification-options";

type Props = {
  positions: PortfolioConcentrationPosition[];
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

export function PortfolioConcentrationAnalysis({ positions }: Props) {
  const [dimension, setDimension] = useState<ConcentrationDimension>("asset");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const analysis = useMemo(
    () => getPortfolioConcentration(positions, dimension),
    [dimension, positions],
  );
  const largestGroup = analysis.groups[0]!;

  return (
    <section
      className="space-y-4 border-t pt-5"
      aria-labelledby="concentration-heading"
    >
      <div className="space-y-1">
        <h3 id="concentration-heading" className="text-sm font-semibold">
          Concentração observada
        </h3>
        <p className="text-sm text-muted-foreground">
          A participação mostra quanto cada posição ou classificação representa
          do patrimônio com valor disponível. Ela não mede, sozinha, a
          diversificação da carteira.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Dimensão da concentração"
      >
        {dimensions.map((item) => (
          <Button
            key={item.key}
            type="button"
            size="sm"
            variant={dimension === item.key ? "default" : "outline"}
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
          <div className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">Maior participação observada:</span>{" "}
              {displayLabel(largestGroup.label)} ·{" "}
              {formatPercentage(largestGroup.percentage)}
            </p>
            <p>
              <span className="font-medium">Base:</span>{" "}
              {formatCurrency(analysis.totalValue)} em{" "}
              {analysis.valuedPositions}{" "}
              {analysis.valuedPositions === 1
                ? "posição valorizada"
                : "posições valorizadas"}
            </p>
            <p>
              <span className="font-medium">Sem valor disponível:</span>{" "}
              {analysis.unvaluedPositions}{" "}
              {analysis.unvaluedPositions === 1 ? "posição" : "posições"}; fora
              do denominador.
            </p>
            <p>
              <span className="font-medium">Classificado nesta dimensão:</span>{" "}
              {formatCurrency(analysis.classifiedValue)} (
              {formatPercentage(
                analysis.totalValue > 0
                  ? (analysis.classifiedValue / analysis.totalValue) * 100
                  : 0,
              )}
              ) em {analysis.classifiedPositions}{" "}
              {analysis.classifiedPositions === 1 ? "posição" : "posições"}
            </p>
            <p>
              <span className="font-medium">Não classificado:</span>{" "}
              {formatCurrency(analysis.unclassifiedValue)} (
              {formatPercentage(
                analysis.totalValue > 0
                  ? (analysis.unclassifiedValue / analysis.totalValue) * 100
                  : 0,
              )}
              ) em {analysis.unclassifiedPositions}{" "}
              {analysis.unclassifiedPositions === 1 ? "posição" : "posições"}
            </p>
          </div>

          <ul
            className="space-y-3"
            aria-label={`Concentração por ${dimensions.find((item) => item.key === dimension)?.label.toLocaleLowerCase("pt-BR")}`}
          >
            {analysis.groups.map((group) => (
              <li key={group.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {displayLabel(group.label)}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatPercentage(group.percentage)} ·{" "}
                    {formatCurrency(group.value)}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${displayLabel(group.label)}: ${formatPercentage(group.percentage)}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, group.percentage))}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.max(0, group.percentage))}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-sm text-muted-foreground">
        Uma participação maior torna o patrimônio mais sensível a variações
        naquela posição ou grupo, mantendo os demais valores iguais. Isso
        descreve a exposição observada e não é uma meta nem um sinal de compra
        ou venda.
      </p>

      <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
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
        <CollapsibleContent className="space-y-2 pt-2 text-sm text-muted-foreground">
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
