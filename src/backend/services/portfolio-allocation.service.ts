import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioClassificationRepository } from "@/backend/repositories/portfolio-classification.repository";
import { portfolioAllocationTargetRepository } from "@/backend/repositories/portfolio-allocation-target.repository";
import {
  getPortfolioAssetKey,
  inferPortfolioAssetClassification,
  type PortfolioAssetClassification,
} from "@/backend/services/portfolio-classification";
import { logger } from "@/infrastructure/logging/logger";
import { portfolioPositionService } from "@/backend/services/portfolio-position.service";
import { isValidPortfolioAllocationTargets } from "@/lib/portfolio-allocation-target-values";

export class PortfolioAllocationService {
  async getAllocation(requestId?: string) {
    const estimatedPositions =
      await portfolioPositionService.listCurrentEnriched(requestId);
    return this.classifyPositions(estimatedPositions, requestId);
  }

  async classifyPositions<
    T extends {
      assetCode: string | null;
      product: string;
      issuer: string | null;
      institution: string | null;
      indexer: string | null;
      regimeType: string | null;
      assetKey?: string;
    },
  >(positions: T[], requestId?: string) {
    const assetKeyFor = (position: T) =>
      ("assetKey" in position ? position.assetKey : undefined) ??
      getPortfolioAssetKey(position);

    const saved = await portfolioClassificationRepository.listByAssetKeys(
      positions.map(assetKeyFor),
      requestId,
    );
    const savedByKey = new Map(saved.map((item) => [item.assetKey, item]));
    return positions.map((position) => {
      const assetKey = assetKeyFor(position);
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

  async getAllocationTargets(requestId?: string) {
    return portfolioAllocationTargetRepository.get(requestId);
  }

  async updateAllocationTargets(
    percentages: Record<string, number>,
    requestId?: string,
  ) {
    if (!isValidPortfolioAllocationTargets(percentages)) {
      throw new ApplicationError(
        "Use metas completas entre 0 e 100%, com até duas casas decimais, totalizando exatamente 100%.",
        400,
      );
    }
    const saved = await portfolioAllocationTargetRepository.save(
      percentages,
      requestId,
    );
    logger.info("portfolio_allocation_targets_updated", {
      requestId,
      assetClasses: Object.keys(saved).length,
    });
    return saved;
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
    const positions = await portfolioPositionService.listCurrent(requestId);
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
          ("assetKey" in position ? position.assetKey : undefined) ??
            getPortfolioAssetKey(position),
          position,
        ]),
      ).values(),
    ];
    const assetKeyFor = (position: (typeof uniquePositions)[number]) =>
      ("assetKey" in position ? position.assetKey : undefined) ??
      getPortfolioAssetKey(position);
    const assetKeys = uniquePositions.map(assetKeyFor);

    const saved = await portfolioClassificationRepository.listByAssetKeys(
      assetKeys,
      requestId,
    );
    const savedByKey = new Map(saved.map((item) => [item.assetKey, item]));
    const classifications = uniquePositions.map((position) => {
      const assetKey = assetKeyFor(position);
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
