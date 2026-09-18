import { logger } from "@/infrastructure/logging/logger";
import { portfolioService } from "@/backend/services/portfolio.service";

export class PortfolioController {
  async overview(requestId: string) {
    logger.info("portfolio_overview_requested", { requestId });
    const overview = await portfolioService.getOverview(requestId);
    logger.info("portfolio_overview_responded", {
      requestId,
      positions: overview.positions.length,
      movements: overview.movements.length,
    });
    return Response.json(overview);
  }

  async positions(requestId: string) {
    logger.info("portfolio_positions_requested", { requestId });
    const positions = await portfolioService.listPositions(requestId);
    logger.info("portfolio_positions_responded", {
      requestId,
      positions: positions.length,
    });
    return Response.json(positions);
  }
}

export const portfolioController = new PortfolioController();
