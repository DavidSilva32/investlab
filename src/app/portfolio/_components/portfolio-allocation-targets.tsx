"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import type { PortfolioPosition } from "@/app/portfolio/_components/portfolio-classification-list";
import { formatCurrency } from "@/lib/utils";
import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";

type AssetClass = (typeof portfolioAssetClassOptions)[number];
type Targets = Partial<Record<AssetClass, number>>;

type Props = {
  positions: PortfolioPosition[];
  targetPercentages: Targets;
  saving: boolean;
  onSave: (targets: Record<AssetClass, number>) => Promise<boolean>;
};

function positionValue(position: PortfolioPosition) {
  if (
    position.estimatedValue !== undefined &&
    position.estimatedValue !== null &&
    Number.isFinite(position.estimatedValue)
  ) {
    return position.estimatedValue;
  }
  if (position.totalValue === null) return null;
  const value = Number(position.totalValue);
  return Number.isFinite(value) ? value : null;
}

function initialDraft(targets: Targets): Record<AssetClass, string> {
  return Object.fromEntries(
    portfolioAssetClassOptions.map((assetClass) => [
      assetClass,
      String(targets[assetClass] ?? 0),
    ]),
  ) as Record<AssetClass, string>;
}

export function PortfolioAllocationTargets({
  positions,
  targetPercentages,
  saving,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [draft, setDraft] = useState(() => initialDraft(targetPercentages));
  const [message, setMessage] = useState<string | null>(null);
  const current = useMemo(() => {
    const byClass = new Map<AssetClass, number>();
    let valuedTotal = 0;
    let unclassifiedValue = 0;
    let unclassifiedValuedCount = 0;
    let unvaluedCount = 0;
    for (const position of positions) {
      const value = positionValue(position);
      if (value === null) {
        unvaluedCount += 1;
        continue;
      }
      valuedTotal += value;
      const assetClass = position.classification
        .assetClass as AssetClass | null;
      if (!assetClass || !portfolioAssetClassOptions.includes(assetClass)) {
        unclassifiedValue += value;
        unclassifiedValuedCount += 1;
      } else {
        byClass.set(assetClass, (byClass.get(assetClass) ?? 0) + value);
      }
    }
    return {
      valuedTotal,
      unclassifiedValue,
      unclassifiedValuedCount,
      unvaluedCount,
      byClass,
    };
  }, [positions]);

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
              Metas da sua estratégia
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Compare a carteira à sua estratégia pessoal. Metas não são
              recomendações universais.
            </p>
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
                <span className="text-right">Meta − atual</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Diferença = meta − atual; valor positivo significa que a
                alocação está abaixo da meta.
              </p>
              <ul className="space-y-2">
                {portfolioAssetClassOptions.map((assetClass) => {
                  const actual =
                    current.valuedTotal > 0
                      ? ((current.byClass.get(assetClass) ?? 0) /
                          current.valuedTotal) *
                        100
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
                            " p.p."}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {current.valuedTotal === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Não há valores atuais disponíveis para comparar com as metas.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Base atual: {formatCurrency(current.valuedTotal)} com valor
                  informado.{" "}
                  {current.unclassifiedValuedCount > 0 &&
                    current.unclassifiedValuedCount +
                      " posição(ões) com valor (" +
                      formatCurrency(current.unclassifiedValue) +
                      ") sem classe não entram nas linhas acima. "}
                  {current.unvaluedCount > 0 &&
                    current.unvaluedCount +
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
