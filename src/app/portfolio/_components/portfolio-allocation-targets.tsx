"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import { formatCurrency } from "@/lib/utils";
import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";
import type { PortfolioConcentration } from "@/lib/portfolio-concentration";
import type { PortfolioPosition } from "@/app/portfolio/_components/portfolio-classification-list";

type AssetClass = (typeof portfolioAssetClassOptions)[number];
type Targets = Partial<Record<AssetClass, number>>;

type Props = {
  positions?: PortfolioPosition[];
  classSummary?: PortfolioConcentration | null;
  targetPercentages: Targets;
  saving: boolean;
  onSave: (targets: Record<AssetClass, number>) => Promise<boolean>;
};

function initialDraft(targets: Targets): Record<AssetClass, string> {
  return Object.fromEntries(
    portfolioAssetClassOptions.map((assetClass) => [
      assetClass,
      String(targets[assetClass] ?? 0),
    ]),
  ) as Record<AssetClass, string>;
}

export function PortfolioAllocationTargets({
  classSummary = null,
  targetPercentages,
  saving,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDraft(targetPercentages));
  const [message, setMessage] = useState<string | null>(null);
  const current = classSummary;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        Number(draft[assetClass]),
      ]),
    ) as Record<AssetClass, number>;
    if (!isValidPortfolioAllocationTargets(values)) {
      setMessage(
        "Use percentuais entre 0 e 100, com até duas casas decimais, somando 100%.",
      );
      return;
    }
    setMessage(null);
    if (await onSave(values)) {
      setEditing(false);
      setComparisonOpen(false);
    }
  }

  function beginEditing() {
    setDraft(initialDraft(targetPercentages));
    setMessage(null);
    setComparisonOpen(true);
    setEditing(true);
  }

  const hasTargets = portfolioAssetClassOptions.some(
    (assetClass) => targetPercentages[assetClass] !== undefined,
  );

  return (
    <section
      aria-labelledby="allocation-targets-title"
      className="space-y-4 border-t pt-5"
    >
      <Collapsible
        open={comparisonOpen || editing || !hasTargets}
        onOpenChange={setComparisonOpen}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3
              id="allocation-targets-title"
              className="text-base font-semibold"
            >
              Metas pessoais de alocação
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={beginEditing}
              >
                {hasTargets ? "Editar metas" : "Definir metas"}
              </Button>
            )}
            {hasTargets && !editing && (
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={comparisonOpen}
                  aria-label={
                    comparisonOpen
                      ? "Recolher comparação de metas"
                      : "Mostrar comparação de metas"
                  }
                >
                  {comparisonOpen ? "Recolher" : "Comparar"}
                  <ChevronDown
                    aria-hidden="true"
                    className={
                      comparisonOpen ? "ml-1 size-4 rotate-180" : "ml-1 size-4"
                    }
                  />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>
        <CollapsibleContent className="space-y-4">
          {" "}
          {editing ? (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Metas pessoais são uma estratégia sua, não uma recomendação
                universal.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {portfolioAssetClassOptions.map((assetClass) => (
                  <label
                    key={assetClass}
                    className="space-y-1.5 text-sm font-medium"
                  >
                    <span>{assetClass}</span>
                    <div className="relative">
                      <Input
                        aria-label={"Meta de " + assetClass}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        inputMode="decimal"
                        value={draft[assetClass]}
                        onChange={(event) =>
                          setDraft((previous) => ({
                            ...previous,
                            [assetClass]: event.target.value,
                          }))
                        }
                        disabled={saving}
                        className="pr-8"
                      />
                      <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando…" : "Salvar metas"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setMessage(null);
                  }}
                >
                  Cancelar
                </Button>
                {message && (
                  <p role="alert" className="text-sm text-destructive">
                    {message}
                  </p>
                )}
              </div>
            </form>
          ) : hasTargets ? (
            <div className="space-y-3">
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] gap-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_6rem_6rem_6rem]">
                <span>Classe</span>
                <span className="text-right">Atual</span>
                <span className="text-right">Meta</span>
                <span className="text-right">Diferença (%)</span>
              </div>
              <Collapsible className="text-xs text-muted-foreground">
                <CollapsibleTrigger className="flex w-fit cursor-pointer items-center gap-1 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group">
                  Como ler a comparação
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="mt-2 max-w-2xl">
                    Diferença = meta menos percentual atual. Positivo indica que
                    a classe está abaixo da meta. As metas refletem sua
                    estratégia pessoal, não uma recomendação universal.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              <ul className="space-y-2">
                {portfolioAssetClassOptions.map((assetClass) => {
                  const actual =
                    current && current.totalValue > 0
                      ? (current.groups.find(
                          (group) => group.label === assetClass,
                        )?.percentage ?? 0)
                      : null;
                  const target = targetPercentages[assetClass] ?? 0;
                  const difference = actual === null ? null : target - actual;
                  return (
                    <li
                      key={assetClass}
                      className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_5rem] items-baseline gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_6rem_6rem]"
                    >
                      <span className="truncate font-medium">{assetClass}</span>
                      <span className="text-right tabular-nums">
                        {actual === null ? "—" : actual.toFixed(1) + "%"}
                      </span>
                      <span className="text-right tabular-nums">
                        {target.toFixed(1)}%
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {difference === null
                          ? "—"
                          : (difference > 0 ? "+" : "") +
                            difference.toFixed(1) +
                            "%"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!current || current.totalValue === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Não há valores atuais disponíveis para comparar com as metas.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Base atual: {formatCurrency(current.totalValue)} com valor
                  informado.{" "}
                  {current.unclassifiedPositions > 0 &&
                    current.unclassifiedPositions +
                      " posição(ões) com valor (" +
                      formatCurrency(current.unclassifiedValue) +
                      ") sem classe não entram nas linhas acima. "}
                  {current.unvaluedPositions > 0 &&
                    current.unvaluedPositions +
                      " posição(ões) sem valor atual não entram no cálculo."}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ainda não há metas salvas. Defina percentuais para comparar com a
              distribuição atual da carteira.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
