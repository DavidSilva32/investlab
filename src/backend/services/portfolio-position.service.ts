import { importRepository } from "@/backend/repositories/import.repository";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";

export class PortfolioPositionService {
  async listCurrent(requestId?: string) {
    const [imported, manual] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      manualPortfolioPositionService.list(requestId),
    ]);
    return [...imported, ...manual];
  }

  async enrichImportedPositions<
    T extends {
      source?: string;
      product: string;
      assetCode: string | null;
      indexer: string | null;
      totalValue: string | null;
      referenceDate?: string | null;
    },
  >(positions: T[]) {
    const imported = positions.filter(
      (position) => position.source !== "MANUAL",
    );
    const manual = positions
      .filter((position) => position.source === "MANUAL")
      .map((position) => ({
        ...position,
        cdiPercentage: null,
        estimatedValue: null,
        cdbEstimateStatus: null,
      }));
    return [...(await cdbEstimateService.enrich(imported)), ...manual];
  }

  async listCurrentEnriched(requestId?: string) {
    const positions = await this.listCurrent(requestId);
    return this.enrichImportedPositions(positions);
  }
}

export const portfolioPositionService = new PortfolioPositionService();
