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
import { StrategyGuidance } from "@/app/portfolio/_components/strategy-guidance";
import { PortfolioConcentrationAnalysis } from "@/app/portfolio/_components/portfolio-concentration-analysis";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";
import type {
  ConcentrationDimension,
  PortfolioConcentration,
} from "@/lib/portfolio-concentration";
import { getApiMessage } from "@/lib/api-message";

const loadErrorMessage = "Não foi possível carregar a alocação.";

export function PortfolioAllocation({
  nextContributionGuidance,
}: {
  nextContributionGuidance?: ContributionGuidance;
}) {
  const [positions, setPositions] = useState<PortfolioPosition[] | null>(null);
  const [concentrations, setConcentrations] = useState<Record<
    ConcentrationDimension,
    PortfolioConcentration
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    let failureMessage = loadErrorMessage;
    fetch("/api/portfolio/allocation")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          failureMessage = getApiMessage(body, loadErrorMessage);
          throw new Error("portfolio_allocation_load_failed");
        }
        const data = body as {
          positions: PortfolioPosition[];
          concentrations: Record<
            ConcentrationDimension,
            PortfolioConcentration
          >;
        };
        setPositions(data.positions);
        setConcentrations(data.concentrations);
        setError(null);
      })
      .catch(() => setError(failureMessage));
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
      const result: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(result, "Não foi possível salvar a classificação."),
        );
        return false;
      }
      toast.success(
        getApiMessage(
          result,
          successMessage(result as { count?: number; message?: string }),
        ),
      );
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
        <CardTitle>Detalhes da carteira</CardTitle>
        <CardDescription>
          A classificação pode ser ajustada quando necessário. A orientação de
          aportes usa{" "}
          {nextContributionGuidance?.allocationMode === "strategy"
            ? "a Estratégia e apenas posições de Longo Prazo"
            : nextContributionGuidance?.allocationMode === "legacy"
              ? "as metas pessoais legadas salvas anteriormente"
              : "a fonte atualmente configurada no planejamento de aportes"}
          .
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
          </>
        ) : (
          <>
            {concentrations && (
              <PortfolioConcentrationAnalysis analyses={concentrations} />
            )}
            <StrategyGuidance
              nextContributionGuidance={nextContributionGuidance}
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
