import { randomUUID } from "node:crypto";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";
import { portfolioService } from "@/backend/services/portfolio.service";
import { runWithDataOwner } from "@/infrastructure/auth/data-owner-context";

export class McpPortfolioToolsService {
  async getMyPortfolio(userId: string, requestId?: string) {
    return runWithDataOwner(userId, async () => {
      const overview = await portfolioService.getOverview(
        requestId ?? randomUUID(),
      );
      const positions = overview.positions.filter(
        (position): position is NonNullable<typeof position> =>
          position !== undefined,
      );
      return {
        valuationDate: overview.valuationDate,
        positionCount: positions.length,
        positions: positions.map((position) => ({
          id: position.id,
          product: position.product,
          assetCode: position.assetCode,
          source: position.source,
          quantity: position.quantity,
          value: position.totalValue,
          valueDate: position.referenceDate,
        })),
        knownValueBrl: positions.reduce(
          (total, position) => total + Number(position.totalValue ?? 0),
          0,
        ),
        movements: overview.movements,
      };
    });
  }

  async listMyManualPositions(userId: string, requestId?: string) {
    return runWithDataOwner(userId, () =>
      manualPortfolioPositionService.list(requestId ?? randomUUID()),
    );
  }
}

export const mcpPortfolioToolsService = new McpPortfolioToolsService();
