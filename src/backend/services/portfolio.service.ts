import { logger } from "@/infrastructure/logging/logger";
import { importRepository } from "@/backend/repositories/import.repository";
import { bcbReferenceRatesService } from "@/backend/services/bcb-reference-rates.service";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import {
  getNextContributionGuidance,
  type ContributionGuidance,
} from "@/lib/next-contribution-guidance";

const unavailableGuidance: ContributionGuidance = {
  status: "unavailable",
  title: "Orientação temporariamente indisponível",
  explanation:
    "Não foi possível carregar classificações ou metas agora. Os dados da carteira continuam disponíveis; tente atualizar novamente.",
};

export class PortfolioService {
  async getOverview(requestId?: string) {
    logger.info("portfolio_overview_loading", { requestId });
    const [positions, movements] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      importRepository.listMovements(requestId),
    ]);
    const [estimatedPositions, referenceRates] = await Promise.all([
      cdbEstimateService.enrich(positions).then((result) => [...result]),
      bcbReferenceRatesService.getReferenceRates(),
    ]);
    const [classificationResult, targetsResult, emergencyReserve] =
      await Promise.all([
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
        emergencyReserveService.getSummary(estimatedPositions, requestId),
      ]);
    const positionsWithClassification =
      classificationResult.value ?? estimatedPositions;
    const nextContributionGuidance =
      classificationResult.value === null || targetsResult.value === null
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
      movements,
      referenceRates,
      emergencyReserve,
      nextContributionGuidance,
    };
  }

  async listPositions(requestId?: string) {
    logger.info("portfolio_positions_loading", { requestId });
    const positions = await importRepository.listLatestPositions(requestId);
    const estimatedPositions = await cdbEstimateService.enrich(positions);
    logger.info("portfolio_positions_loaded", {
      requestId,
      positions: estimatedPositions.length,
    });
    return estimatedPositions;
  }
}

export const portfolioService = new PortfolioService();
