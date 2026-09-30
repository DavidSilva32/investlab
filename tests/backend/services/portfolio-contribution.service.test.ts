import { beforeEach, describe, expect, it, vi } from "vitest";

const positionsService = vi.hoisted(() => ({
  listCurrent: vi.fn(),
  enrichImportedPositions: vi.fn(),
}));
const allocationService = vi.hoisted(() => ({
  classifyPositions: vi.fn(),
  getAllocationTargets: vi.fn(),
}));
const reserveService = vi.hoisted(() => ({ getContributionContext: vi.fn() }));
vi.mock("@/backend/services/portfolio-position.service", () => ({
  portfolioPositionService: positionsService,
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: allocationService,
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: reserveService,
}));

import { PortfolioService } from "@/backend/services/portfolio.service";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

const position = (assetCode: string, totalValue: string) => ({
  product: "CDB DI",
  assetCode,
  institution: "Banco A",
  issuer: "Banco A S.A.",
  indexer: "CDI",
  regimeType: "Pós-fixado",
  issuedAt: "2024-01-01",
  maturityAt: "2028-01-01",
  totalValue,
  estimatedValue: null,
  classification: { assetClass: "Renda fixa" },
});

describe("PortfolioService.calculateContribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses classified known positions and reserve settings for a separate first slice", async () => {
    const reservePosition = position("RESERVE", "800");
    const longTermPosition = position("LONG-TERM", "100");
    const classified = [reservePosition, longTermPosition];
    const targets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa"
          ? 50
          : assetClass === "Renda variável"
            ? 50
            : 0,
      ]),
    );
    positionsService.listCurrent.mockResolvedValue(classified);
    positionsService.enrichImportedPositions.mockResolvedValue(classified);
    allocationService.classifyPositions.mockResolvedValue(classified);
    allocationService.getAllocationTargets.mockResolvedValue(targets);
    reserveService.getContributionContext.mockResolvedValue({
      calculation: {
        monthlyExpenses: 1000,
        targetMonths: 1,
        selectedValue: 800,
        selectedGroups: 1,
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        referenceDate: "2026-01-01",
        targetValue: 1000,
        coveredMonths: 0.8,
        difference: 200,
        progressPercentage: 80,
        status: "below_target",
      },
      selectedAssetKeys: [getEmergencyReserveAssetKey(reservePosition)],
    });

    const result = await new PortfolioService().calculateContribution(
      300,
      "r1",
    );

    expect(result).toMatchObject({
      status: "ready",
      reserveAmount: 200,
      remainingAmount: 100,
      longTermPortfolioValue: 100,
      strategySource: "user_defined",
    });
    expect(allocationService.classifyPositions).toHaveBeenCalledWith(
      classified,
      "r1",
    );
    expect(reserveService.getContributionContext).toHaveBeenCalledWith(
      classified,
    );
    expect(
      result.allocations.find((item) => item.assetClass === "Renda fixa")
        ?.currentValue,
    ).toBe(100);
  });
});
