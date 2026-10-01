import { logger } from "@/infrastructure/logging/logger";
import { importRepository } from "@/backend/repositories/import.repository";
import { bcbReferenceRatesService } from "@/backend/services/bcb-reference-rates.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import {
  getNextContributionGuidance,
  type ContributionGuidance,
} from "@/lib/next-contribution-guidance";
import {
  calculateContributionAllocation,
  type ContributionPosition,
} from "@/lib/contribution-allocation";
import { getPortfolioInsights } from "@/lib/portfolio-insights";

const unavailableGuidance: ContributionGuidance = {
  status: "unavailable",
  title: "Orientação temporariamente indisponível",
  explanation:
    "Não foi possível carregar classificações ou metas agora. Os dados da carteira continuam disponíveis; tente atualizar novamente.",
};

export class PortfolioService {
  async calculateContribution(contributionAmount: number, requestId?: string) {
    const current = await portfolioPositionService.listCurrent(requestId);
    const estimated =
      await portfolioPositionService.enrichImportedPositions(current);
    const [positions, targets] = await Promise.all([
      portfolioAllocationService.classifyPositions(estimated, requestId),
      portfolioAllocationService.getAllocationTargets(requestId),
    ]);
    const reserve =
      await emergencyReserveService.getContributionContext(positions);
    return calculateContributionAllocation({
      contributionAmount,
      positions: positions as ContributionPosition[],
      targets,
      reserve: reserve.calculation,
      selectedReserveAssetKeys: reserve.selectedAssetKeys,
      strategySource: "user_defined",
    });
  }

  async getOverview(requestId?: string) {
    logger.info("portfolio_overview_loading", { requestId });
    const valuationDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const [positions, movements] = await Promise.all([
      portfolioPositionService.listCurrent(requestId),
      importRepository.listMovements(requestId),
    ]);
    const [estimatedPositions, referenceRates] = await Promise.all([
      portfolioPositionService.enrichImportedPositions(
        positions,
        valuationDate,
      ),
      bcbReferenceRatesService.getReferenceRates(),
    ]);
    const [classificationResult, targetsResult] = await Promise.all([
      portfolioAllocationService
        .classifyPositions(estimatedPositions, requestId)
        .then((value) => ({ value }))
        .catch(() => {
          logger.warn("portfolio_contribution_guidance_unavailable", {
            requestId,
            phase: "classification",
          });
          return { value: null };
        }),
      portfolioAllocationService
        .getAllocationTargets(requestId)
        .then((value) => ({ value }))
        .catch(() => {
          logger.warn("portfolio_contribution_guidance_unavailable", {
            requestId,
            phase: "targets",
          });
          return { value: null };
        }),
    ]);
    let emergencyReserve: EmergencyReserveCalculation | undefined;
    if (classificationResult.value !== null) {
      try {
        emergencyReserve = await emergencyReserveService.getSummary(
          classificationResult.value,
          requestId,
        );
      } catch {
        logger.warn("portfolio_contribution_guidance_unavailable", {
          requestId,
          phase: "emergency_reserve",
        });
      }
    }
    const positionsWithClassification =
      classificationResult.value ?? estimatedPositions;
    const insights = getPortfolioInsights(
      positionsWithClassification,
      new Date(`${valuationDate}T12:00:00-03:00`),
    );
    const nextContributionGuidance =
      classificationResult.value === null ||
      targetsResult.value === null ||
      emergencyReserve === undefined
        ? unavailableGuidance
        : getNextContributionGuidance({
            positions: classificationResult.value,
            targets: targetsResult.value,
            emergencyReserve,
          });
    logger.info("portfolio_overview_loaded", {
      requestId,
      positions: estimatedPositions.length,
      movements: movements.length,
    });
    return {
      positions: positionsWithClassification,
      insights,
      valuationDate,
      movements,
      referenceRates,
      emergencyReserve,
      nextContributionGuidance,
    };
  }
}

export const portfolioService = new PortfolioService();
