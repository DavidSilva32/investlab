import { importRepository } from "@/backend/repositories/import.repository";
import { manualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { decimalToCents, resolvePositionMoney } from "@/lib/portfolio-money";

export function withCanonicalPortfolioValue<
  T extends {
    source?: string | null;
    currency?: string | null;
    totalValue?: string | number | null;
    estimatedValue?: string | number | null;
    estimatedValueCents?: string | null;
    convertedValueBrl?: string | number | null;
  },
>(position: T) {
  const resolved = resolvePositionMoney(position);
  return {
    ...position,
    canonicalValueCents: resolved.cents?.toString() ?? null,
    canonicalValueSource: resolved.source,
    reportedValueCents: decimalToCents(position.totalValue)?.toString() ?? null,
  };
}

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
  >(positions: T[], valuationDate?: string) {
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
    const enriched =
      valuationDate === undefined
        ? await cdbEstimateService.enrich(imported)
        : await cdbEstimateService.enrich(imported, valuationDate);
    return [...enriched, ...manual].map(withCanonicalPortfolioValue);
  }

  async listCurrentEnriched(requestId?: string, valuationDate?: string) {
    const positions = await this.listCurrent(requestId);
    return this.enrichImportedPositions(positions, valuationDate);
  }
}

export const portfolioPositionService = new PortfolioPositionService();
