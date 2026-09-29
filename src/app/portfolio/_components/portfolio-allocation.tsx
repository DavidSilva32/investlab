"use client";

import { useCallback, useEffect, useState } from "react";
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
import { PortfolioAllocationTargets } from "@/app/portfolio/_components/portfolio-allocation-targets";
import { StrategyGuidance } from "@/app/portfolio/_components/strategy-guidance";
import { PortfolioConcentrationAnalysis } from "@/app/portfolio/_components/portfolio-concentration-analysis";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";

type AssetClass = (typeof portfolioAssetClassOptions)[number];

export function PortfolioAllocation({
  nextContributionGuidance,
}: {
  nextContributionGuidance?: ContributionGuidance;
}) {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [targetPercentages, setTargetPercentages] = useState<
    Partial<Record<AssetClass, number>>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    fetch("/api/portfolio/allocation")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setPositions(body.positions);
        setTargetPercentages(body.targetPercentages ?? {});
        setError(null);
      })
      .catch(() => setError("Não foi possível carregar a alocação."));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("portfolio:updated", load);
    return () => window.removeEventListener("portfolio:updated", load);
  }, [load]);

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

  async function saveTargets(targets: Record<AssetClass, number>) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/allocation", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetPercentages: targets }),
      });
      const result: { message?: string } = await response.json();
      if (!response.ok) throw new Error(result.message);
      toast.success("Metas de alocação salvas.");
      load();
      return true;
    } catch {
      toast.error("Não foi possível salvar as metas de alocação.");
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
          Concentração por ativo, classe, subclasse ou geografia. Produto e
          indexador podem sugerir a classificação; geografia fica sem informação
          até ajuste, pois a importação não identifica esse dado. Valores usam a
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
          <>
            <p className="text-sm text-muted-foreground">
              Importe posições para visualizar a classificação e a alocação.
            </p>
            <StrategyGuidance
              nextContributionGuidance={nextContributionGuidance}
            />
            <PortfolioAllocationTargets
              positions={positions}
              targetPercentages={targetPercentages}
              saving={saving}
              onSave={saveTargets}
            />
          </>
        ) : (
          <>
            <PortfolioConcentrationAnalysis positions={positions} />
            <StrategyGuidance
              nextContributionGuidance={nextContributionGuidance}
            />
            <PortfolioAllocationTargets
              positions={positions}
              targetPercentages={targetPercentages}
              saving={saving}
              onSave={saveTargets}
            />
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
