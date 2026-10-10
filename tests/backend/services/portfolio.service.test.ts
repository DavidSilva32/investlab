import { beforeEach, describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  listLatestPositions: vi.fn(),
  listMovements: vi.fn(),
  listPositionSnapshots: vi.fn(),
}));
const manualPositionRepository = vi.hoisted(() => ({
  list: vi.fn(),
  listSnapshots: vi.fn(),
}));
const estimates = vi.hoisted(() => ({ enrich: vi.fn() }));
const portfolioPositions = vi.hoisted(() => ({
  listCurrent: vi.fn(),
  enrichImportedPositions: vi.fn(),
}));
const rates = vi.hoisted(() => ({ getReferenceRates: vi.fn() }));
const reserve = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getContributionContext: vi.fn(),
}));
const allocation = vi.hoisted(() => ({
  classifyPositions: vi.fn(),
  getAllocationTargets: vi.fn(),
}));
const strategyRepository = vi.hoisted(() => ({ get: vi.fn() }));
const strategy = vi.hoisted(() => ({
  getOverview: vi.fn(),
  simulateContribution: vi.fn(),
}));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
}));
vi.mock("@/backend/repositories/manual-portfolio-position.repository", () => ({
  manualPortfolioPositionRepository: manualPositionRepository,
}));
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: estimates,
}));
vi.mock("@/backend/services/bcb-reference-rates.service", () => ({
  bcbReferenceRatesService: rates,
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: reserve,
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: allocation,
}));
vi.mock("@/backend/services/portfolio-position.service", () => ({
  portfolioPositionService: portfolioPositions,
}));
vi.mock(
  "@/backend/repositories/personal-investment-strategy.repository",
  () => ({
    personalInvestmentStrategyRepository: strategyRepository,
  }),
);
vi.mock("@/backend/services/personal-investment-strategy.service", () => ({
  personalInvestmentStrategyService: strategy,
}));
import { PortfolioService } from "@/backend/services/portfolio.service";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

describe("PortfolioService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listPositionSnapshots.mockResolvedValue([]);
    manualPositionRepository.list.mockResolvedValue([]);
    manualPositionRepository.listSnapshots.mockResolvedValue([]);
    strategyRepository.get.mockResolvedValue(null);
    portfolioPositions.listCurrent.mockImplementation((requestId) =>
      repository.listLatestPositions(requestId),
    );
    portfolioPositions.enrichImportedPositions.mockImplementation(
      (positions, valuationDate) => estimates.enrich(positions, valuationDate),
    );
  });
  it("builds a monthly review from persisted position snapshots", async () => {
    repository.listPositionSnapshots.mockResolvedValue([
      {
        id: "snapshot-1",
        referenceDate: "2026-01-31",
        createdAt: "2026-02-01T12:00:00Z",
        importedAt: "2026-02-01T12:01:00Z",
        source: "B3",
        positions: [
          {
            identity: "asset-a",
            totalValue: "100.00",
            valuationSource: "FECHAMENTO",
          },
        ],
      },
      {
        id: "snapshot-2",
        referenceDate: "2026-02-28",
        createdAt: "2026-03-01T12:00:00Z",
        importedAt: "2026-03-01T12:01:00Z",
        source: "B3",
        positions: [
          {
            identity: "asset-a",
            totalValue: "120.00",
            valuationSource: "FECHAMENTO",
          },
        ],
      },
    ]);

    const review = await new PortfolioService().getMonthlyReview(
      "2026-02",
      "request-monthly-review",
    );

    expect(repository.listPositionSnapshots).toHaveBeenCalledWith(
      "request-monthly-review",
    );
    expect(review).toMatchObject({
      status: "ready",
      selectedPeriod: "2026-02",
      observedChangeCents: "2000",
    });
  });
  it("includes manually reported assets from their immutable observations", async () => {
    manualPositionRepository.list.mockResolvedValue([
      { assetKey: "manual:voo" },
    ]);
    manualPositionRepository.listSnapshots.mockResolvedValue([
      {
        assetKey: "manual:voo",
        product: "Vanguard S&P 500 ETF",
        assetCode: "VOO",
        currency: "USD",
        totalValue: "1000.00",
        convertedValueBrl: "5000.00",
        positionDate: "2026-01-05",
        conversionDate: "2026-01-05",
        status: "ACTIVE",
        recordedAt: "2026-01-05T12:00:00.000Z",
      },
      {
        assetKey: "manual:voo",
        product: "Vanguard S&P 500 ETF",
        assetCode: "VOO",
        currency: "USD",
        totalValue: "1000.00",
        convertedValueBrl: "9000.00",
        positionDate: "2026-02-04",
        conversionDate: "2026-02-04",
        status: "ACTIVE",
        recordedAt: "2026-02-04T12:00:00.000Z",
      },
    ]);

    const review = await new PortfolioService().getMonthlyReview("2026-02");

    expect(review).toMatchObject({
      status: "ready",
      observedChangeCents: "400000",
      current: {
        knownValueCents: "900000",
        sources: ["Valor informado"],
        sourceReferences: [
          { source: "Valor informado", referenceDate: "2026-02-04" },
        ],
      },
      previous: { knownValueCents: "500000" },
      flowSeparation: { status: "unavailable" },
    });
  });

  it("keeps deletion observations out of the current manual total", async () => {
    manualPositionRepository.listSnapshots.mockResolvedValue([
      {
        assetKey: "manual:voo",
        product: "VOO",
        assetCode: "VOO",
        currency: "USD",
        totalValue: "1000.00",
        convertedValueBrl: "5000.00",
        positionDate: "2026-02-10",
        conversionDate: "2026-02-10",
        status: "DELETED",
        recordedAt: "2026-02-10T12:00:00.000Z",
      },
    ]);

    const review = await new PortfolioService().getMonthlyReview("2026-02");
    expect(review).toMatchObject({
      status: "no_previous_close",
      current: { positionCount: 0, knownValueCents: "0" },
    });
  });
  it("loads positions and estimates once, then shares them for allocation, reserve and guidance", async () => {
    const rawPositions = [{ id: "p1" }];
    const estimated = [{ id: "p1", estimatedValue: 100, totalValue: "100" }];
    const classified = [
      { ...estimated[0], classification: { assetClass: "Renda fixa" } },
    ];
    const targets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" ? 100 : 0,
      ]),
    );
    repository.listLatestPositions.mockResolvedValue(rawPositions);
    repository.listMovements.mockResolvedValue([{ id: "m1" }]);
    estimates.enrich.mockResolvedValue(estimated);
    allocation.classifyPositions.mockResolvedValue(classified);
    allocation.getAllocationTargets.mockResolvedValue(targets);
    rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
    reserve.getSummary.mockResolvedValue({
      selectedValue: 0,
      unvaluedGroups: 0,
      missingSelectionCount: 0,
      status: "on_target",
      difference: 0,
    });
    const service = new PortfolioService();
    await expect(service.getOverview("request-1")).resolves.toMatchObject({
      positions: classified,
      movements: [{ id: "m1" }],
      emergencyReserve: { selectedValue: 0 },
      nextContributionGuidance: { status: "no_gap" },
    });
    expect(repository.listLatestPositions).toHaveBeenCalledTimes(1);
    const valuationDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    expect(estimates.enrich).toHaveBeenCalledWith(rawPositions, valuationDate);
    expect(allocation.classifyPositions).toHaveBeenCalledWith(
      estimated,
      "request-1",
    );
    expect(allocation.getAllocationTargets).toHaveBeenCalledWith("request-1");
    expect(reserve.getSummary).toHaveBeenCalledWith(classified, "request-1");
  });
  it.each(["classification", "targets", "emergency_reserve"] as const)(
    "keeps the dashboard available when the %s lookup fails",
    async (failedLookup) => {
      const estimated = [{ id: "p1", estimatedValue: 100, totalValue: "100" }];
      const classified = [
        { ...estimated[0], classification: { assetClass: "Renda fixa" } },
      ];
      repository.listLatestPositions.mockResolvedValue([{ id: "p1" }]);
      repository.listMovements.mockResolvedValue([]);
      estimates.enrich.mockResolvedValue(estimated);
      rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
      reserve.getSummary.mockResolvedValue({
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        status: "not_configured",
        difference: null,
      });
      allocation.classifyPositions.mockResolvedValue(classified);
      allocation.getAllocationTargets.mockResolvedValue({});
      if (failedLookup === "classification")
        allocation.classifyPositions.mockRejectedValue(
          new Error("private classification failure"),
        );
      else if (failedLookup === "targets")
        allocation.getAllocationTargets.mockRejectedValue(
          new Error("private target failure"),
        );
      else
        reserve.getSummary.mockRejectedValue(
          new Error("private emergency reserve failure"),
        );
      const result = await new PortfolioService().getOverview("request-2");
      expect(result.nextContributionGuidance).toMatchObject({
        status: "unavailable",
      });
      expect(result.positions).toEqual(
        failedLookup === "classification" ? estimated : classified,
      );
      if (failedLookup === "targets")
        expect(result.emergencyReserve).toBeDefined();
      else expect(result.emergencyReserve).toBeUndefined();
      if (failedLookup === "classification")
        expect(reserve.getSummary).not.toHaveBeenCalled();
      expect(estimates.enrich).toHaveBeenCalledWith(
        [{ id: "p1" }],
        result.valuationDate,
      );
    },
  );

  it("uses the explicitly activated four-class Strategy for Portfolio guidance", async () => {
    const estimated = [{ id: "p1", estimatedValue: 100, totalValue: "100" }];
    const classified = [
      { ...estimated[0], classification: { assetClass: "Renda fixa" } },
    ];
    repository.listLatestPositions.mockResolvedValue([{ id: "p1" }]);
    repository.listMovements.mockResolvedValue([]);
    estimates.enrich.mockResolvedValue(estimated);
    rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
    allocation.classifyPositions.mockResolvedValue(classified);
    allocation.getAllocationTargets.mockRejectedValue(
      new Error("legacy target lookup should not be needed"),
    );
    strategyRepository.get.mockResolvedValue({
      allocationActive: true,
      allocationPercentages: {
        fixed_income: 50,
        brazilian_equities: 25,
        international_etfs: 25,
        fiis: 0,
      },
    });
    strategy.getOverview.mockResolvedValue({
      savedAllocationPercentages: {
        fixed_income: 50,
        brazilian_equities: 25,
        international_etfs: 25,
        fiis: 0,
      },
      longTermWealth: {
        positionCount: 2,
        unvaluedPositionCount: 0,
        unclassifiedKnownValueCents: "0",
        classes: [
          { id: "fixed_income", label: "Renda fixa", currentPercentage: 30 },
          {
            id: "brazilian_equities",
            label: "Ações e BDRs",
            currentPercentage: 40,
          },
          {
            id: "international_etfs",
            label: "ETFs internacionais",
            currentPercentage: 20,
          },
          {
            id: "fiis",
            label: "Fundos imobiliários (FIIs)",
            currentPercentage: 10,
          },
        ],
      },
    });
    reserve.getSummary.mockResolvedValue({
      status: "not_configured",
      difference: null,
      unvaluedGroups: 0,
      missingSelectionCount: 0,
    });

    const result = await new PortfolioService().getOverview("request-strategy");
    expect(result.contributionAllocationMode).toBe("strategy");
    expect(result.nextContributionGuidance).toMatchObject({
      status: "target_gap",
      assetClass: "Renda fixa",
      allocationMode: "strategy",
    });
    expect(strategy.getOverview).toHaveBeenCalledWith("request-strategy");
  });

  it.each(["settings", "active_strategy"] as const)(
    "does not guess a contribution source when the %s lookup fails",
    async (failedLookup) => {
      repository.listLatestPositions.mockResolvedValue([{ id: "p1" }]);
      repository.listMovements.mockResolvedValue([]);
      estimates.enrich.mockResolvedValue([]);
      allocation.classifyPositions.mockResolvedValue([]);
      allocation.getAllocationTargets.mockResolvedValue({});
      rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
      reserve.getSummary.mockResolvedValue({
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        status: "not_configured",
        difference: null,
      });
      if (failedLookup === "settings") {
        strategyRepository.get.mockRejectedValue(new Error("private"));
      } else {
        strategyRepository.get.mockResolvedValue({ allocationActive: true });
        strategy.getOverview.mockRejectedValue(new Error("private"));
      }

      const result = await new PortfolioService().getOverview("request-failed");

      expect(result.nextContributionGuidance).toMatchObject({
        status: "unavailable",
      });
      expect(result.contributionAllocationMode).toBe(
        failedLookup === "settings" ? "unavailable" : "strategy",
      );
    },
  );

  it.each([
    {
      label: "incomplete_data when long-term positions exist but are unvalued",
      complete: false,
      unvaluedPositionCount: 2,
      expectedStatus: "incomplete_data",
    },
    {
      label: "no_positions when no long-term positions exist",
      complete: true,
      unvaluedPositionCount: 0,
      expectedStatus: "no_positions",
    },
  ])("reports $label in active Strategy mode", async (scenario) => {
    const positions = [{ id: "p1" }];
    repository.listLatestPositions.mockResolvedValue(positions);
    estimates.enrich.mockResolvedValue(positions);
    allocation.classifyPositions.mockResolvedValue(positions);
    strategyRepository.get.mockResolvedValue({
      allocationActive: true,
      allocationPercentages: {
        fixed_income: 50,
        brazilian_equities: 25,
        international_etfs: 25,
        fiis: 0,
      },
    });
    reserve.getContributionContext.mockResolvedValue({
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
    strategy.simulateContribution.mockResolvedValue({
      enteredContributionCents: "10000",
      reserveContributionCents: "0",
      strategyContributionCents: "10000",
      reserveStatus: "not_configured",
      reserveDifferenceCents: null,
      simulation: {
        totalCents: "0",
        contributionCents: "10000",
        unallocatedContributionCents: "10000",
        completeness: {
          complete: scenario.complete,
          unvaluedPositionCount: scenario.unvaluedPositionCount,
          unclassifiedKnownValueCents: "0",
          valuationDate: "2026-10-02",
          valuationDates: [],
        },
        allocations: [
          {
            id: "fixed_income",
            label: "Renda fixa",
            currentValueCents: "0",
            targetPercentage: 50,
            currentPercentage: 0,
            projectedValueCents: "5000",
            projectedPercentage: 50,
            contributionValueCents: "5000",
          },
        ],
      },
    });

    const result = await new PortfolioService().calculateContribution(100);

    expect(result).toMatchObject({
      allocationMode: "strategy",
      status: scenario.expectedStatus,
      longTermPortfolioValue: 0,
      unknownPositionCount: scenario.unvaluedPositionCount,
      allocations: [{ assetClass: "Renda fixa" }],
    });
    expect(result.allocations[0]).toHaveProperty(
      "assetClassId",
      "fixed_income",
    );
  });
});
