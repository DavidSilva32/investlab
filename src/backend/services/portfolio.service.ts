import { logger } from "@/infrastructure/logging/logger";
import { importRepository } from "@/backend/repositories/import.repository";
import { enrichCdbEstimates } from "@/backend/services/cdb-estimate.service";
import { getBcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";

export class PortfolioService {
  async getOverview(requestId?: string) {
    logger.info("portfolio_overview_loading", { requestId });
    const [positions, movements] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      importRepository.listMovements(requestId),
    ]);
    const [estimatedPositions, referenceRates] = await Promise.all([
      enrichCdbEstimates(positions),
      getBcbReferenceRates(),
    ]);
    logger.info("portfolio_overview_loaded", {
      requestId,
      positions: estimatedPositions.length,
      movements: movements.length,
    });
    return { positions: estimatedPositions, movements, referenceRates };
  }

  async listPositions(requestId?: string) {
    logger.info("portfolio_positions_loading", { requestId });
    const positions = await importRepository.listLatestPositions(requestId);
    const estimatedPositions = await enrichCdbEstimates(positions);
    logger.info("portfolio_positions_loaded", {
      requestId,
      positions: estimatedPositions.length,
    });
    return estimatedPositions;
  }
}

export const portfolioService = new PortfolioService();
