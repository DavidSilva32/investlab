import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import type { ContributionGuidance } from "@/lib/next-contribution-guidance";
import type { PortfolioConcentration } from "@/lib/portfolio-concentration";
import type { PortfolioInsights } from "@/lib/portfolio-insights";

export type PortfolioDiagnostic = {
  id:
    | "values"
    | "estimates"
    | "classification"
    | "reserve"
    | "allocation"
    | "maturity";
  severity: "missing" | "attention" | "information";
  title: string;
  detail: string;
  count?: number;
  action: "positions" | "classification" | "reserve" | "strategy";
  href?: string;
};

export type PortfolioDiagnosticsInput = {
  insights: PortfolioInsights;
  classificationStatus: "loading" | "loaded" | "unavailable";
  classDistribution: PortfolioConcentration | null;
  nextContributionGuidance?: ContributionGuidance;
  emergencyReserve?: EmergencyReserveCalculation;
};

/** Presents limitations already established by the canonical portfolio services. */
export function getPortfolioDiagnostics({
  insights,
  classificationStatus,
  classDistribution,
  nextContributionGuidance,
  emergencyReserve,
}: PortfolioDiagnosticsInput): PortfolioDiagnostic[] {
  const rows: PortfolioDiagnostic[] = [];
  if (insights.unvaluedPositions > 0) {
    rows.push({
      id: "values",
      severity: "missing",
      title: "Valores ausentes",
      detail:
        "O total conhecido não inclui todas as posições. Revise os valores disponíveis.",
      count: insights.unvaluedPositions,
      action: "positions",
      href: "/portfolio?view=positions",
    });
  }
  const estimateCount =
    insights.provisionalEstimates + insights.unavailableEstimates;
  if (estimateCount > 0) {
    rows.push({
      id: "estimates",
      severity: "attention",
      title: "Estimativas de CDB com ressalvas",
      detail:
        "Há estimativas provisórias ou indisponíveis. Consulte a situação de cada posição antes de usar esses valores.",
      count: estimateCount,
      action: "positions",
      href: "/portfolio?view=positions",
    });
  }
  if (
    classificationStatus === "loaded" &&
    classDistribution !== null &&
    classDistribution.unclassifiedPositions > 0
  ) {
    rows.push({
      id: "classification",
      severity: "missing",
      title: "Distribuição por classes incompleta",
      detail:
        "Há posições com valor conhecido sem classe informada. Revise a classificação para completar essa distribuição.",
      count: classDistribution.unclassifiedPositions,
      action: "classification",
    });
  }
  if (
    emergencyReserve &&
    (emergencyReserve.unvaluedGroups > 0 ||
      (emergencyReserve.missingSelectionCount ?? 0) > 0)
  ) {
    rows.push({
      id: "reserve",
      severity: "missing",
      title: "Cobertura da reserva incompleta",
      detail:
        "A reserva contém seleções ausentes ou grupos sem valor. Revise as posições vinculadas antes de comparar com sua meta.",
      action: "reserve",
      href: "/portfolio?panel=objectives&objective=reserve",
    });
  }
  if (
    nextContributionGuidance?.status === "target_gap" &&
    nextContributionGuidance.assetClass &&
    Number.isFinite(nextContributionGuidance.currentPercentage) &&
    Number.isFinite(nextContributionGuidance.targetPercentage)
  ) {
    rows.push({
      id: "allocation",
      severity: "information",
      title: "Diferença para sua meta pessoal",
      detail: nextContributionGuidance.explanation,
      action:
        nextContributionGuidance.allocationMode === "legacy"
          ? "classification"
          : "strategy",
      href:
        nextContributionGuidance.allocationMode === "legacy"
          ? "/portfolio?panel=classification"
          : "/strategy",
    });
  }
  const maturity = insights.upcomingMaturities[0];
  if (maturity && /^\d{4}-\d{2}-\d{2}$/.test(maturity.maturityAt)) {
    const parsed = new Date(`${maturity.maturityAt}T00:00:00Z`);
    if (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().startsWith(maturity.maturityAt)
    ) {
      rows.push({
        id: "maturity",
        severity: "information",
        title: "Próximo vencimento informado",
        detail: `${maturity.product} · ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed)}. Vencimento não confirma disponibilidade para resgate.`,
        action: "positions",
        href: "/portfolio?view=positions",
      });
    }
  }
  return rows;
}
