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

  async updateClassifications(
    input: {
      positionIds: string[];
      assetClass?: string | null;
      subClass?: string | null;
      geography?: string | null;
    },
    requestId?: string,
  ) {
    const positions = await importRepository.listLatestPositions(requestId);
    const requestedIds = [...new Set(input.positionIds)];
    const requested = new Set(requestedIds);
    const selectedPositions = positions.filter((position) =>
      requested.has(position.id),
    );
    if (selectedPositions.length !== requestedIds.length) {
      throw new ApplicationError(
        "Uma ou mais posições não estão mais na carteira atual.",
        404,
      );
    }

    const uniquePositions = [
      ...new Map(
        selectedPositions.map((position) => [
          getPortfolioAssetKey(position),
          position,
        ]),
      ).values(),
    ];
    const assetKeys = uniquePositions.map(getPortfolioAssetKey);
    const saved = await portfolioClassificationRepository.listByAssetKeys(
      assetKeys,
      requestId,
    );
    const savedByKey = new Map(saved.map((item) => [item.assetKey, item]));
    const classifications = uniquePositions.map((position) => {
      const assetKey = getPortfolioAssetKey(position);
      const current =
        savedByKey.get(assetKey) ?? inferPortfolioAssetClassification(position);
      return {
        assetKey,
        assetClass:
          input.assetClass === undefined
            ? current.assetClass
            : input.assetClass,
        subClass:
          input.subClass === undefined ? current.subClass : input.subClass,
        geography:
          input.geography === undefined ? current.geography : input.geography,
      };
    });
    await portfolioClassificationRepository.upsertMany(
      classifications,
      requestId,
    );
    logger.info("portfolio_classifications_updated", {
      requestId,
      count: selectedPositions.length,
    });
    return { count: selectedPositions.length };
  }
}

export const portfolioAllocationService = new PortfolioAllocationService();
