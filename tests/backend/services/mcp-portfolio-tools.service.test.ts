import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listManualPositions: vi.fn(),
  getEmergencyReserveEditorData: vi.fn(),
  getObjectivesOverview: vi.fn(),
  getLongTermStrategyOverview: vi.fn(),
  getAllocationOverview: vi.fn(),
  getAllocationTargets: vi.fn(),
  getMonthlyReview: vi.fn(),
  listRecentOperations: vi.fn(),
  simulateObjectiveProjection: vi.fn(),
  getMarketByTicker: vi.fn(),
  runWithDataOwner: vi.fn((userId: string, operation: () => unknown) => {
    mocks.runWithDataOwnerCall(userId);
    return operation();
  }),
  runWithDataOwnerCall: vi.fn(),
}));

vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: { getOverview: mocks.getOverview },
}));
vi.mock("@/backend/services/manual-portfolio-position.service", () => ({
  manualPortfolioPositionService: {
    list: mocks.listManualPositions,
  },
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: {
    getEditorData: mocks.getEmergencyReserveEditorData,
  },
}));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: { getOverview: mocks.getObjectivesOverview },
}));
vi.mock("@/backend/services/personal-investment-strategy.service", () => ({
  personalInvestmentStrategyService: {
    getOverview: mocks.getLongTermStrategyOverview,
  },
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: {
    getAllocationOverview: mocks.getAllocationOverview,
    getAllocationTargets: mocks.getAllocationTargets,
  },
}));
vi.mock("@/backend/services/portfolio-operation.service", () => ({
  portfolioOperationService: { listRecentForMcp: mocks.listRecentOperations },
}));
vi.mock("@/backend/services/objective-projection.service", () => ({
  objectiveProjectionService: { simulate: mocks.simulateObjectiveProjection },
}));
vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: { getMarketByTicker: mocks.getMarketByTicker },
}));
vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: {
    getOverview: mocks.getOverview,
    getMonthlyReview: mocks.getMonthlyReview,
  },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  runWithDataOwner: mocks.runWithDataOwner,
}));

import { McpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";

describe("McpPortfolioToolsService read tools", () => {
  const service = new McpPortfolioToolsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads portfolio value, positions, and movements inside the token owner's context", async () => {
    const overview = {
      valuationDate: "2026-10-19",
      positions: [
        {
          id: "position-1",
          product: "ETF",
          assetCode: "VOO",
          source: "MANUAL",
          quantity: "2",
          totalValue: "1500.25",
          referenceDate: "2026-10-19",
        },
        undefined,
      ],
      movements: [{ id: "movement-1", type: "BUY", amount: "1500.25" }],
    };
    mocks.getOverview.mockResolvedValue(overview);

    const result = await service.getMyPortfolio("owner-from-sub", "req-1");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.getOverview).toHaveBeenCalledWith("req-1");
    expect(result).toEqual({
      valuationDate: "2026-10-19",
      positionCount: 1,
      positions: [
        {
          id: "position-1",
          product: "ETF",
          assetCode: "VOO",
          source: "MANUAL",
          quantity: "2",
          value: "1500.25",
          valueDate: "2026-10-19",
        },
      ],
      knownValueBrl: 1500.25,
      movements: overview.movements,
    });
    expect(JSON.stringify(result)).not.toContain("other-user");
  });

  it("lists manual positions under the same authenticated owner", async () => {
    const positions = [{ id: "position-1" }];
    mocks.listManualPositions.mockResolvedValue(positions);

    await expect(
      service.listMyManualPositions("owner-from-sub", "req-2"),
    ).resolves.toBe(positions);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.listManualPositions).toHaveBeenCalledWith("req-2");
  });

  it("returns only the connected owner's emergency reserve summary", async () => {
    const calculation = {
      monthlyExpenses: 4200,
      targetMonths: 12,
      selectedValue: 50642.41,
      targetValue: 50400,
      coveredMonths: 12.05,
      progressPercentage: 100,
      status: "above_target",
    };
    mocks.getEmergencyReserveEditorData.mockResolvedValue({
      calculation,
      holdings: [{ ticker: "CDB-PRIVATE" }],
    });

    await expect(
      service.getMyEmergencyReserve("owner-from-sub", "req-reserve"),
    ).resolves.toEqual(calculation);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.getEmergencyReserveEditorData).toHaveBeenCalledWith(
      "req-reserve",
    );
  });

  it("preserves an unconfigured empty reserve and propagates data errors", async () => {
    const unconfiguredCalculation = {
      monthlyExpenses: null,
      targetMonths: null,
      selectedValue: 0,
      targetValue: null,
      coveredMonths: null,
      status: "not_configured",
    };
    mocks.getEmergencyReserveEditorData.mockResolvedValue({
      calculation: unconfiguredCalculation,
      holdings: [],
    });
    await expect(service.getMyEmergencyReserve("owner-empty")).resolves.toEqual(
      unconfiguredCalculation,
    );
    expect(mocks.getEmergencyReserveEditorData).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-empty");

    mocks.getEmergencyReserveEditorData.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      service.getMyEmergencyReserve("owner-error", "req-error"),
    ).rejects.toThrow("database unavailable");
  });

  it("returns objective summaries without detailed positions under the owner's context", async () => {
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          kind: "GOAL",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 10000,
          monthlyPlannedAmount: 500,
          currentValue: 2500,
          knownValue: 2500,
          remainingAmount: 7500,
          progressPercent: 25,
          assignedPositionCount: 1,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          assignedAssetKeys: ["private-asset-key"],
          balanceTracking: null,
        },
      ],
      destinationSummary: { knownTotal: 2500 },
      positions: [{ assetCode: "private-position" }],
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });

    const result = await service.getMyObjectives("owner-objectives", "req-obj");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-objectives");
    expect(mocks.getObjectivesOverview).toHaveBeenCalledWith("req-obj");
    expect(result).toEqual({
      objectives: [
        {
          kind: "GOAL",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 10000,
          monthlyPlannedAmount: 500,
          currentValue: 2500,
          knownValue: 2500,
          remainingAmount: 7500,
          progressPercent: 25,
          assignedPositionCount: 1,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          balanceTracking: null,
        },
      ],
      destinationSummary: { knownTotal: 2500 },
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private-position");
    expect(JSON.stringify(result)).not.toContain("private-asset-key");
  });

  it("reads strategy, allocation, and monthly review in the connected owner's context", async () => {
    const strategy = { longTermWealth: { knownValueCents: "100000" } };
    const allocation = {
      positions: [{ assetCode: "VOO" }],
      concentrations: { asset: [{ label: "VOO", percentage: 60 }] },
      classDistribution: [{ label: "ETFs internacionais", percentage: 60 }],
    };
    mocks.getLongTermStrategyOverview.mockResolvedValue(strategy);
    mocks.getAllocationOverview.mockResolvedValue(allocation);
    mocks.getAllocationTargets.mockResolvedValue({ international_etfs: 60 });
    mocks.getMonthlyReview.mockResolvedValue({
      selectedPeriod: "2026-09",
      availablePeriods: ["2026-09", "2026-08"],
      status: "ready",
      dateAlignment: "aligned",
      compositionCoverage: "equivalent",
      valuationMethodCoverage: "equivalent",
      current: { knownValueCents: "100000" },
      previous: { knownValueCents: "90000" },
      observedChangeCents: "10000",
      gapMonths: 0,
      untrackedManualPositionCount: 0,
      flowSeparation: { status: "unavailable" },
      history: [{ period: "2026-09" }],
    });

    await expect(
      service.getMyLongTermStrategy("owner-strategy", "req-strategy"),
    ).resolves.toBe(strategy);
    await expect(
      service.getMyPortfolioAllocation("owner-allocation", "req-allocation"),
    ).resolves.toEqual({
      positionCount: 1,
      classDistribution: allocation.classDistribution,
      concentrations: allocation.concentrations,
      targetPercentages: { international_etfs: 60 },
    });
    await expect(
      service.getMyMonthlyPortfolioReview(
        "owner-review",
        "2026-09",
        "req-review",
      ),
    ).resolves.toEqual({
      selectedPeriod: "2026-09",
      availablePeriods: ["2026-09", "2026-08"],
      status: "ready",
      dateAlignment: "aligned",
      compositionCoverage: "equivalent",
      valuationMethodCoverage: "equivalent",
      current: { knownValueCents: "100000" },
      previous: { knownValueCents: "90000" },
      observedChangeCents: "10000",
      gapMonths: 0,
      untrackedManualPositionCount: 0,
      flowSeparation: { status: "unavailable" },
    });
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      1,
      "owner-strategy",
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      2,
      "owner-allocation",
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      3,
      "owner-review",
    );
    expect(mocks.getLongTermStrategyOverview).toHaveBeenCalledWith(
      "req-strategy",
    );
    expect(mocks.getAllocationOverview).toHaveBeenCalledWith("req-allocation");
    expect(mocks.getAllocationTargets).toHaveBeenCalledWith("req-allocation");
    expect(mocks.getMonthlyReview).toHaveBeenCalledWith(
      "2026-09",
      "req-review",
    );
  });

  it("returns the already bounded recent operation and reconciliation window in the owner's context", async () => {
    mocks.listRecentOperations.mockResolvedValue({
      operations: [
        {
          id: "new-op",
          side: "SELL",
          effectiveDate: "2026-10-01",
          product: "ETF",
          assetCode: "VOO",
          quantity: "1",
          unitPrice: "500",
          currency: "USD",
          fees: null,
        },
        {
          id: "old-op",
          side: "BUY",
          effectiveDate: "2026-01-01",
          product: "Old",
          idempotencyKey: "private-key",
        },
      ],
      movements: [{ id: "movement-1", occurredAt: "2026-10-01" }],
      reconciliationEvents: [
        {
          operationId: "old-op",
          movementId: "movement-2",
          status: "LINK",
          eventOrder: 3,
        },
      ],
      hasMore: {
        operations: false,
        movements: true,
        reconciliationEvents: false,
      },
    });

    const result = await service.getMyOperations("owner-ops", "req-ops");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-ops");
    expect(mocks.listRecentOperations).toHaveBeenCalledWith("req-ops");
    expect(result).toMatchObject({
      returnedCounts: { operations: 2, movements: 1, reconciliationEvents: 1 },
      operations: [{ id: "new-op", assetCode: "VOO" }, { id: "old-op" }],
      hasMore: {
        operations: false,
        movements: true,
        reconciliationEvents: false,
      },
    });
    expect(result.limitations).toContain("não representam o estado atual");
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(result.hasMore).toEqual({
      operations: false,
      movements: true,
      reconciliationEvents: false,
    });
  });

  it("creates request IDs when optional MCP read context is omitted", async () => {
    mocks.listRecentOperations.mockResolvedValue({
      operations: [],
      movements: [],
      reconciliationEvents: [],
      hasMore: {
        operations: false,
        movements: false,
        reconciliationEvents: false,
      },
    });
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [],
      destinationSummary: {},
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });
    mocks.getLongTermStrategyOverview.mockResolvedValue({ strategy: null });
    mocks.getAllocationOverview.mockResolvedValue({
      positions: [],
      classDistribution: [],
      concentrations: {},
    });
    mocks.getAllocationTargets.mockResolvedValue({});
    mocks.getMonthlyReview.mockResolvedValue({
      selectedPeriod: null,
      availablePeriods: [],
      status: "empty",
    });

    await service.getMyOperations("owner-ops-no-request-id");
    await service.getMyObjectives("owner-objectives-no-request-id");
    await service.getMyLongTermStrategy("owner-strategy-no-request-id");
    await service.getMyPortfolioAllocation("owner-allocation-no-request-id");
    await service.getMyMonthlyPortfolioReview("owner-review-no-request-id");

    for (const requestId of [
      mocks.listRecentOperations.mock.calls[0][0],
      mocks.getObjectivesOverview.mock.calls[0][0],
      mocks.getLongTermStrategyOverview.mock.calls[0][0],
      mocks.getAllocationOverview.mock.calls[0][0],
      mocks.getAllocationTargets.mock.calls[0][0],
      mocks.getMonthlyReview.mock.calls[0][1],
    ]) {
      expect(requestId).toMatch(/^[\da-f-]{36}$/i);
    }
  });

  it("calculates a hypothetical objective projection without returning monthly detail", async () => {
    const input = {
      mode: "project_balance" as const,
      startingAmount: 1000,
      monthlyContribution: 100,
      horizonYears: 1,
      annualReturnPercent: 5,
      annualInflationPercent: 3,
      adjustContributionsForInflation: false,
    };
    mocks.simulateObjectiveProjection.mockReturnValue({
      ...input,
      projectedNominalAmount: 2300,
      projectedPurchasingPowerAmount: 2200,
      totalInvestedAmount: 2200,
      nominalGrowthAmount: 100,
      requiredMonthlyContribution: null,
      contributionTiming: "end_of_month",
      points: [{ year: 0, nominalAmount: 1000 }],
      months: [{ month: 1, nominalAmount: 1100 }],
    });

    const result = await service.simulateMyObjectiveProjection(
      "owner-sim",
      input,
    );

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-sim");
    expect(mocks.simulateObjectiveProjection).toHaveBeenCalledWith(input);
    expect(result).toMatchObject({
      projectedNominalAmount: 2300,
      monthlyDetailIncluded: false,
      interpretation: expect.stringContaining("hipotética"),
    });
    expect(result).not.toHaveProperty("months");
  });

  it("retrieves only bounded market quote fields and reports unavailable tickers", async () => {
    mocks.getMarketByTicker.mockImplementation(async (ticker: string) => {
      if (ticker === "ABCD4") throw new Error("provider detail");
      return {
        ticker,
        companyName: "Empresa",
        price: 12.34,
        priceUpdatedAt: "2026-10-19T12:00:00.000Z",
        cnpj: "private-cnpj",
        logoUrl: "private-logo",
      };
    });

    const result = await service.getMarketQuotes(
      [" abcd3 ", "ABCD4", "ABCD3"],
      "req-market",
    );

    expect(mocks.getMarketByTicker).toHaveBeenCalledTimes(2);
    expect(mocks.getMarketByTicker).toHaveBeenNthCalledWith(
      1,
      "ABCD3",
      "req-market",
    );
    expect(mocks.getMarketByTicker).toHaveBeenNthCalledWith(
      2,
      "ABCD4",
      "req-market",
    );
    expect(result.results).toEqual([
      {
        ticker: "ABCD3",
        companyName: "Empresa",
        price: 12.34,
        observedAt: "2026-10-19T12:00:00.000Z",
      },
    ]);
    expect(result.unavailableTickers).toEqual(["ABCD4"]);
    expect(JSON.stringify(result)).not.toContain("private-cnpj");
    expect(JSON.stringify(result)).not.toContain("private-logo");
  });

  it("creates request identifiers when callers omit them and treats unknown values as zero", async () => {
    mocks.getOverview.mockResolvedValue({
      valuationDate: null,
      positions: [
        {
          id: "position-null-value",
          product: "CDB",
          assetCode: "CDB-1",
          source: "MANUAL",
          quantity: null,
          totalValue: null,
          referenceDate: null,
        },
      ],
      movements: [],
    });

    await expect(
      service.getMyPortfolio("owner-no-request-id"),
    ).resolves.toMatchObject({
      positionCount: 1,
      knownValueBrl: 0,
    });
    expect(mocks.getOverview).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith(
      "owner-no-request-id",
    );

    mocks.listManualPositions.mockResolvedValue([]);
    await expect(
      service.listMyManualPositions("owner-no-request-id"),
    ).resolves.toEqual([]);
    expect(mocks.listManualPositions).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
  });
});
