import { logger } from "@/infrastructure/logging/logger";
import { importRepository } from "@/backend/repositories/import.repository";
import { bcbReferenceRatesService } from "@/backend/services/bcb-reference-rates.service";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";

export class PortfolioService {
  async getOverview(requestId?: string) {
    logger.info("portfolio_overview_loading", { requestId });
    const [positions, movements] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      importRepository.listMovements(requestId),
    ]);
    const [estimatedPositions, referenceRates] = await Promise.all([
      cdbEstimateService.enrich(positions),
      bcbReferenceRatesService.getReferenceRates(),
    ]);
    const emergencyReserve = await emergencyReserveService.getSummary(
      estimatedPositions,
      requestId,
    );
    logger.info("portfolio_overview_loaded", {
      requestId,
      positions: estimatedPositions.length,
      movements: movements.length,
    });
    return {
      positions: estimatedPositions,
      movements,
      referenceRates,
      emergencyReserve,
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
