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
import { formatCurrency } from "@/lib/utils";

type Classification = {
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
};
type Position = {
  id: string;
  product: string;
  institution: string | null;
  estimatedValue?: number | null;
  totalValue: string | null;
  classification: Classification;
  classificationSource: "manual" | "inferred" | "unclassified";
};
type Grouping = "assetClass" | "subClass" | "geography";

const classOptions = [
  "Renda fixa",
  "Renda variável",
  "Fundos",
  "Criptoativos",
  "Imóveis",
  "Outros",
];
const geographyOptions = ["Brasil", "Exterior", "Global"];
const unknownLabel = "Não informado";

function positionValue(position: Position) {
  if (
    position.estimatedValue !== undefined &&
    position.estimatedValue !== null
  ) {
    return Number.isFinite(position.estimatedValue)
      ? position.estimatedValue
      : null;
  }
  if (position.totalValue === null) return null;
  const value = Number(position.totalValue);
  return Number.isFinite(value) ? value : null;
}

function formatPositionValue(position: Position) {
  const value = positionValue(position);
  return value === null ? "Sem valor atual" : formatCurrency(value);
}

export function PortfolioAllocation() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("assetClass");
  const [editingId, setEditingId] = useState<string | null>(null);
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

  async function save(position: Position, formData: FormData) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/allocation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          positionId: position.id,
          assetClass: formData.get("assetClass") || null,
          subClass: String(formData.get("subClass") || "").trim() || null,
          geography: formData.get("geography") || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setEditingId(null);
      toast.success("Classificação salva.");
      load();
    } catch {
      toast.error("Não foi possível salvar a classificação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classificação e alocação</CardTitle>
        <CardDescription>
          Distribuição por classe, subclasse ou geografia. Produto e indexador
          podem sugerir a classificação; geografia fica sem informação até
          ajuste. Valores usam a estimativa atual quando disponível, ou o valor
          importado.
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
            <div className="space-y-3 border-t pt-5">
              <h3 className="text-sm font-semibold">
                Posições e classificação
              </h3>
              {positions.map((position) => (
                <div key={position.id} className="rounded-lg border p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {position.product}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          position.institution,
                          position.classification.assetClass ?? unknownLabel,
                          position.classification.subClass ?? unknownLabel,
                          position.classification.geography ?? unknownLabel,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        {position.classificationSource === "inferred"
                          ? " · sugestão baseada no produto ou indexador B3"
                          : position.classificationSource === "manual"
                            ? " · ajuste manual"
                            : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-sm tabular-nums">
                        {formatPositionValue(position)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-expanded={editingId === position.id}
                        onClick={() =>
                          setEditingId(
                            editingId === position.id ? null : position.id,
                          )
                        }
                      >
                        {editingId === position.id
                          ? "Fechar"
                          : "Editar classificação"}
                      </Button>
                    </div>
                  </div>
                  {editingId === position.id && (
                    <form
                      className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void save(position, new FormData(event.currentTarget));
                      }}
                    >
                      <label className="grid gap-1.5 text-sm">
                        Classe
                        <select
                          name="assetClass"
                          defaultValue={
                            position.classification.assetClass ?? ""
                          }
                          className="h-10 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Não informado</option>
                          {classOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        Subclasse
                        <input
                          name="subClass"
                          maxLength={120}
                          defaultValue={position.classification.subClass ?? ""}
                          placeholder="Ex.: Tesouro IPCA+"
                          className="h-10 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm sm:col-span-2">
                        Geografia
                        <select
                          name="geography"
                          defaultValue={position.classification.geography ?? ""}
                          className="h-10 rounded-md border bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Não informado</option>
                          {geographyOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex justify-end sm:col-span-2">
                        <Button type="submit" disabled={saving}>
                          {saving ? "Salvando…" : "Salvar classificação"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
