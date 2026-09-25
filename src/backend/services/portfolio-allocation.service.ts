import { ApplicationError } from "@/backend/errors/application-error";
import { importRepository } from "@/backend/repositories/import.repository";
import { portfolioClassificationRepository } from "@/backend/repositories/portfolio-classification.repository";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import {
  getPortfolioAssetKey,
  inferPortfolioAssetClassification,
  type PortfolioAssetClassification,
} from "@/backend/services/portfolio-classification";
import { logger } from "@/infrastructure/logging/logger";

export class PortfolioAllocationService {
  async getAllocation(requestId?: string) {
    const positions = await importRepository.listLatestPositions(requestId);
    const [estimatedPositions, saved] = await Promise.all([
      cdbEstimateService.enrich(positions),
      portfolioClassificationRepository.listByAssetKeys(
        positions.map(getPortfolioAssetKey),
        requestId,
      ),
    ]);
    const savedByKey = new Map(saved.map((item) => [item.assetKey, item]));
    return estimatedPositions.map((position) => {
      const assetKey = getPortfolioAssetKey(position);
      const manual = savedByKey.get(assetKey);
      const classification: PortfolioAssetClassification = manual
        ? {
            assetClass: manual.assetClass,
            subClass: manual.subClass,
            geography: manual.geography,
          }
        : inferPortfolioAssetClassification(position);
      return {
        ...position,
        classification,
        classificationSource: manual
          ? "manual"
          : classification.assetClass
            ? "inferred"
            : "unclassified",
      };
    });
  }

  async updateClassification(
    input: {
      positionId: string;
      assetClass: string | null;
      subClass: string | null;
      geography: string | null;
    },
    requestId?: string,
  ) {
    const positions = await importRepository.listLatestPositions(requestId);
    const position = positions.find((item) => item.id === input.positionId);
    if (!position) {
      throw new ApplicationError(
        "A posição não está mais na carteira atual.",
        404,
      );
    }
    const assetKey = getPortfolioAssetKey(position);
    const classification = await portfolioClassificationRepository.upsert(
      {
        assetKey,
        assetClass: input.assetClass,
        subClass: input.subClass,
        geography: input.geography,
      },
      requestId,
    );
    logger.info("portfolio_classification_updated", { requestId });
    return classification;
  }
}

export const portfolioAllocationService = new PortfolioAllocationService();
