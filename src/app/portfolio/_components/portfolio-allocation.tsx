"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PortfolioClassificationList,
  type BulkClassification,
  type PortfolioPosition,
} from "@/app/portfolio/_components/portfolio-classification-list";
import { formatCurrency } from "@/lib/utils";

type Grouping = "assetClass" | "subClass" | "geography";
const unknownLabel = "Não informado";

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

export function PortfolioAllocation() {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("assetClass");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch("/api/portfolio/allocation")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setPositions(body.positions);
        setError(null);
      })
      .catch(() => setError("Não foi possível carregar a alocação."));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("portfolio:updated", load);
    return () => window.removeEventListener("portfolio:updated", load);
  }, [load]);

  const totalValue = useMemo(
    () =>
      (positions ?? []).reduce(
        (total, position) => total + (positionValue(position) ?? 0),
        0,
      ),
    [positions],
  );
  const allocations = useMemo(() => {
    const groups = new Map<string, number>();
    for (const position of positions ?? []) {
      const value = positionValue(position);
      if (value === null) continue;
      const label = position.classification[grouping] ?? unknownLabel;
      groups.set(label, (groups.get(label) ?? 0) + value);
    }
    return [...groups.entries()]
      .map(([label, value]) => ({
        label,
        value,
        percentage: totalValue ? (value / totalValue) * 100 : 0,
      }))
      .sort((left, right) => right.value - left.value);
  }, [grouping, positions, totalValue]);

  async function patchClassification(
    body: unknown,
    successMessage: (result: { count?: number; message?: string }) => string,
  ) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/allocation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: { count?: number; message?: string } =
        await response.json();
      if (!response.ok) throw new Error(result.message);
      toast.success(successMessage(result));
      load();
      return true;
    } catch {
      toast.error("Não foi possível salvar a classificação.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveSingle(position: PortfolioPosition, formData: FormData) {
    const assetClass = formData.get("assetClass") as string | null;
    const geography = formData.get("geography") as string | null;
    return patchClassification(
      {
        positionId: position.id,
        assetClass: assetClass === "__not_informed__" ? null : assetClass,
        subClass: String(formData.get("subClass") || "").trim() || null,
        geography: geography === "__not_informed__" ? null : geography,
      },
      () => "Classificação salva.",
    );
  }

  async function saveBulk(input: BulkClassification) {
    return patchClassification(
      input,
      (result) =>
        `Classificação aplicada a ${result.count} ${result.count === 1 ? "posição" : "posições"}.`,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classificação e alocação</CardTitle>
        <CardDescription>
          Distribuição por classe, subclasse ou geografia. Produto e indexador
          podem sugerir a classificação; geografia fica sem informação até
          ajuste, pois a importação não identifica esse dado. Valores usam a
          estimativa atual quando disponível, ou o valor importado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <div role="alert" className="space-y-3 text-sm text-destructive">
            <p>{error}</p>
            <Button type="button" variant="outline" onClick={load}>
              Tentar novamente
            </Button>
          </div>
        ) : positions === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando distribuição…
          </p>
        ) : positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Importe posições para visualizar a classificação e a alocação.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Patrimônio com valor informado: {formatCurrency(totalValue)}
              </p>
              <div
                aria-label="Agrupar alocação"
                className="flex flex-wrap gap-2"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={grouping === "assetClass" ? "default" : "outline"}
                  aria-pressed={grouping === "assetClass"}
                  onClick={() => setGrouping("assetClass")}
                >
                  Classe
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={grouping === "subClass" ? "default" : "outline"}
                  aria-pressed={grouping === "subClass"}
                  onClick={() => setGrouping("subClass")}
                >
                  Subclasse
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={grouping === "geography" ? "default" : "outline"}
                  aria-pressed={grouping === "geography"}
                  onClick={() => setGrouping("geography")}
                >
                  Geografia
                </Button>
              </div>
            </div>
            {allocations.length ? (
              <ul className="space-y-4" aria-label="Distribuição do patrimônio">
                {allocations.map((allocation) => (
                  <li key={allocation.label}>
                    <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
                      <span className="truncate font-medium">
                        {allocation.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {allocation.percentage.toFixed(1)}% ·{" "}
                        {formatCurrency(allocation.value)}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${allocation.label}: ${allocation.percentage.toFixed(1)}%`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={allocation.percentage}
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, Math.max(0, allocation.percentage))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Não há valores atuais para calcular a distribuição.
              </p>
            )}
            <PortfolioClassificationList
              positions={positions}
              saving={saving}
              onSave={saveSingle}
              onSaveBulk={saveBulk}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
