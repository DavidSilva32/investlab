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
const strategyRepository = vi.hoisted(() => ({ get: vi.fn() }));
const strategyService = vi.hoisted(() => ({ simulateContribution: vi.fn() }));
vi.mock("@/backend/services/portfolio-position.service", () => ({
  portfolioPositionService: positionsService,
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: allocationService,
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: reserveService,
}));
vi.mock(
  "@/backend/repositories/personal-investment-strategy.repository",
  () => ({
    personalInvestmentStrategyRepository: strategyRepository,
  }),
);
vi.mock("@/backend/services/personal-investment-strategy.service", () => ({
  personalInvestmentStrategyService: strategyService,
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

function strategyPlan({
  reserveStatus = "not_configured",
  reserveCents = "0",
  remainingCents = "10000",
  simulation = {
    totalCents: "50000",
    contributionCents: "10000",
    unallocatedContributionCents: "0",
    completeness: {
      complete: true,
      unvaluedPositionCount: 0,
      unclassifiedKnownValueCents: "0",
    },
    allocations: [
      {
        id: "fixed_income",
        label: "Renda fixa",
        currentValueCents: "50000",
        currentPercentage: 100,
        targetPercentage: 60,
        contributionValueCents: "10000",
      },
    ],
  },
}: {
  reserveStatus?: "applied" | "not_needed" | "not_configured" | "incomplete";
  reserveCents?: string | null;
  remainingCents?: string | null;
  simulation?: Record<string, unknown> | null;
} = {}) {
  return {
    enteredContributionCents: "10000",
    reserveContributionCents: reserveCents,
    strategyContributionCents: remainingCents,
    reserveStatus,
    reserveSelectedValueCents: "0",
    reserveTargetValueCents: null,
    reserveDifferenceCents: reserveStatus === "incomplete" ? null : "0",
    simulation,
  };
}

describe("PortfolioService.calculateContribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    strategyRepository.get.mockResolvedValue(null);
  });

  function configureActiveStrategy() {
    const longTermPosition = position("LONG-TERM", "500");
    positionsService.listCurrent.mockResolvedValue([longTermPosition]);
    positionsService.enrichImportedPositions.mockResolvedValue([
      longTermPosition,
    ]);
    allocationService.classifyPositions.mockResolvedValue([longTermPosition]);
    strategyRepository.get.mockResolvedValue({
      allocationActive: true,
      allocationPercentages: {
        fixed_income: 60,
        brazilian_equities: 20,
        international_etfs: 20,
        fiis: 0,
      },
    });
    reserveService.getContributionContext.mockResolvedValue({
      calculation: {
        monthlyExpenses: null,
        targetMonths: null,
        selectedValue: 0,
        selectedGroups: 0,
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        referenceDate: null,
        targetValue: null,
        coveredMonths: null,
        difference: null,
        progressPercentage: null,
        status: "not_configured",
      },
      selectedAssetKeys: [],
    });
  }

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

  it("uses the explicitly activated Strategy after the reserve slice", async () => {
    const longTermPosition = position("LONG-TERM", "500");
    positionsService.listCurrent.mockResolvedValue([longTermPosition]);
    positionsService.enrichImportedPositions.mockResolvedValue([
      longTermPosition,
    ]);
    allocationService.classifyPositions.mockResolvedValue([longTermPosition]);
    allocationService.getAllocationTargets.mockResolvedValue({
      "Renda fixa": 100,
    });
    strategyRepository.get.mockResolvedValue({
      allocationActive: true,
      allocationPercentages: {
        fixed_income: 60,
        brazilian_equities: 20,
        international_etfs: 20,
        fiis: 0,
      },
    });
    reserveService.getContributionContext.mockResolvedValue({
      calculation: {
        monthlyExpenses: null,
        targetMonths: null,
        selectedValue: 0,
        selectedGroups: 0,
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        referenceDate: null,
        targetValue: null,
        coveredMonths: null,
        difference: null,
        progressPercentage: null,
        status: "not_configured",
      },
      selectedAssetKeys: [],
    });
    strategyService.simulateContribution.mockResolvedValue(strategyPlan());

    const result = await new PortfolioService().calculateContribution(100);
    expect(strategyService.simulateContribution).toHaveBeenCalledWith(
      {
        contributionAmount: 100,
        allocationPercentages: {
          fixed_income: 60,
          brazilian_equities: 20,
          international_etfs: 20,
          fiis: 0,
        },
      },
      undefined,
    );
    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: "ready",
      longTermPortfolioValue: 500,
      allocations: [
        {
          assetClass: "Renda fixa",
          currentValue: 500,
          targetPercentage: 60,
          contributionAmount: 100,
        },
      ],
    });
  });

  it("blocks Strategy simulation when reserve valuation is incomplete", async () => {
    configureActiveStrategy();
    strategyService.simulateContribution.mockResolvedValueOnce(
      strategyPlan({
        reserveStatus: "incomplete",
        reserveCents: null,
        remainingCents: null,
        simulation: null,
      }),
    );

    const result = await new PortfolioService().calculateContribution(100);

    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: "reserve_incomplete",
      reserveStatus: "incomplete",
    });
    expect(strategyService.simulateContribution).toHaveBeenCalledWith(
      expect.objectContaining({ contributionAmount: 100 }),
      undefined,
    );
  });

  it("asks for a saved Strategy composition before calculating class allocation", async () => {
    configureActiveStrategy();
    strategyRepository.get.mockResolvedValueOnce({
      allocationActive: true,
      allocationPercentages: null,
    });

    const result = await new PortfolioService().calculateContribution(100);

    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: "needs_targets",
      remainingAmount: null,
    });
    expect(strategyService.simulateContribution).not.toHaveBeenCalled();
  });

  it("reports a zero Strategy remainder when the reserve consumes the full contribution", async () => {
    configureActiveStrategy();
    strategyService.simulateContribution.mockResolvedValueOnce(
      strategyPlan({
        reserveStatus: "applied",
        reserveCents: "10000",
        remainingCents: "0",
        simulation: null,
      }),
    );

    const result = await new PortfolioService().calculateContribution(100);

    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: "no_gap",
      reserveAmount: 100,
      remainingAmount: 0,
    });
    expect(strategyService.simulateContribution).toHaveBeenCalledOnce();
  });

  it("reports no class gap and clamps a negative target gap to zero", async () => {
    configureActiveStrategy();
    strategyService.simulateContribution.mockResolvedValueOnce(
      strategyPlan({
        simulation: {
          ...strategyPlan().simulation,
          unallocatedContributionCents: "10000",
          allocations: [
            {
              id: "fixed_income",
              label: "Renda fixa",
              currentValueCents: "50000",
              currentPercentage: 100,
              targetPercentage: 20,
              contributionValueCents: "0",
            },
            {
              id: "brazilian_equities",
              label: "Ações brasileiras",
              currentValueCents: "1000",
              currentPercentage: 2,
              targetPercentage: 80,
              contributionValueCents: "0",
            },
          ],
        },
      }),
    );

    const result = await new PortfolioService().calculateContribution(100);

    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: "no_gap",
      allocations: [
        {
          assetClass: "Renda fixa",
          targetGapValue: 0,
        },
        {
          assetClass: "Ações brasileiras",
          targetGapValue: 470,
        },
      ],
    });
  });
});
