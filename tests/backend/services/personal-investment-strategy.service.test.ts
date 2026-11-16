import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { PersonalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";

const evaluated = [{ id: "evaluated" }];
const position = (
  product: string,
  valueCents: string | null,
  objectivePurpose: string | null,
  overrides: Record<string, unknown> = {},
) => ({
  positionCount: 1,
  product,
  valueCents,
  canonicalValueCents: valueCents,
  knownValueCents: valueCents ?? "0",
  objectiveId: objectivePurpose ? "assigned" : null,
  objectivePurpose,
  assetClass: null,
  geography: null,
  maturityAt: null,
  referenceDate: "2026-09-30",
  unvaluedPositions: valueCents === null ? 1 : 0,
  ...overrides,
  classification: {
    assetClass: (overrides.assetClass as string | null | undefined) ?? null,
    subClass: (overrides.subClass as string | null | undefined) ?? null,
    geography: (overrides.geography as string | null | undefined) ?? null,
  },
});

const saved = {
  answers: { horizonYears: 4, internationalInterest: "interested" as const },
  selectedDirection: "consider_international" as const,
  updatedAt: new Date("2026-10-02T10:00:00.000Z"),
};

const notConfiguredReserve = {
  monthlyExpenses: null,
  targetMonths: null,
  balance: 0,
  referenceDate: null,
  targetValue: null,
  coveredMonths: null,
  difference: null,
  progressPercentage: null,
  status: "not_configured" as const,
};

function makeService(
  positions: ReturnType<typeof position>[] = [],
  reserveCalculation: EmergencyReserveCalculation | null = notConfiguredReserve,
) {
  const positionService = {
    listCurrentEnriched: vi.fn().mockResolvedValue(evaluated),
  };
  const allocationService = {
    classifyPositions: vi.fn().mockResolvedValue(positions),
  };
  const repository = {
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(saved),
    saveAllocationPercentages: vi.fn().mockResolvedValue({
      allocationPercentages: null,
    }),
    activateAllocation: vi.fn().mockResolvedValue({ allocationActive: true }),
  };
  const reserveService = {
    getContributionContext: vi.fn().mockResolvedValue(reserveCalculation),
  };
  const service = new PersonalInvestmentStrategyService(
    positionService as never,
    allocationService as never,
    repository as never,
    reserveService as never,
    () => "2026-10-02",
  );
  return {
    service,
    positionService,
    allocationService,
    repository,
    reserveService,
  };
}

describe("PersonalInvestmentStrategyService", () => {
  it("requires a saved composition before explicit contribution planning activation", async () => {
    const { service, repository } = makeService();
    await expect(
      service.activateAllocation("req-missing"),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.activateAllocation).not.toHaveBeenCalled();

    repository.get.mockResolvedValueOnce({
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });
    await expect(service.activateAllocation("req-active")).resolves.toEqual({
      allocationActive: true,
    });
    expect(repository.activateAllocation).toHaveBeenCalledWith("req-active");
  });
  it("uses one canonical valuation snapshot and includes every portfolio position regardless of legacy destination", async () => {
    const positions = [
      position("CDB", "100", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda fixa",
        maturityAt: "2028-10-02",
      }),
      position("Ação", "200", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Brasil",
        maturityAt: "2032-10-02",
        referenceDate: "2026-10-01",
      }),
      position("ETF Exterior", "300", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Exterior",
        maturityAt: "2027-10-02",
      }),
      position("FII", "400", "LONG_TERM_INVESTMENT", {
        assetClass: "Fundos",
      }),
      position("Outro ativo", "500", "LONG_TERM_INVESTMENT"),
      position("Sem valor", null, "LONG_TERM_INVESTMENT"),
      position("Meta pessoal", "600", "PERSONAL_GOAL"),
      position("Reserva", "700", "RESERVE", {
        referenceDate: "2026-10-02",
      }),
      position("Objetivo antigo", "800", null, { objectiveId: "legacy" }),
      position("Sem destino", "900", null, { objectiveId: null }),
    ];
    const { service, positionService, allocationService } =
      makeService(positions);
    const result = await service.getOverview("request-1");

    expect(positionService.listCurrentEnriched).toHaveBeenCalledWith(
      "request-1",
      "2026-10-02",
    );
    expect(allocationService.classifyPositions).toHaveBeenCalledWith(
      evaluated,
      "request-1",
    );
    expect(result.totalWealth).toEqual({
      knownValueCents: "4500",
      unvaluedPositionCount: 1,
      positionCount: 10,
    });
    expect(result.portfolioWealth.knownValueCents).toBe("4500");
    expect(result.valuationDates).toEqual([
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(result.valuationDatesComplete).toBe(true);
    expect(result.portfolioWealth.positionCount).toBe(10);
    expect(result.portfolioWealth.unvaluedPositionCount).toBe(1);
    expect(result.portfolioWealth.classes).toEqual([
      {
        id: "fixed_income",
        label: "Renda fixa",
        knownValueCents: "100",
        percentageBasisPoints: 222,
        currentPercentage: 2.22,
      },
      {
        id: "brazilian_equities",
        label: "Ações e BDRs",
        knownValueCents: "200",
        percentageBasisPoints: 444,
        currentPercentage: 4.44,
      },
      {
        id: "international_etfs",
        label: "ETFs internacionais",
        knownValueCents: "300",
        percentageBasisPoints: 667,
        currentPercentage: 6.67,
      },
      {
        id: "fiis",
        label: "Fundos imobiliários (FIIs)",
        knownValueCents: "400",
        percentageBasisPoints: 889,
        currentPercentage: 8.89,
      },
    ]);
    expect(result.portfolioWealth.unclassifiedKnownValueCents).toBe("3500");
    expect(result.maturityDates).toEqual([
      { date: "2027-10-02", count: 1 },
      { date: "2028-10-02", count: 1 },
      { date: "2032-10-02", count: 1 },
    ]);
    expect(result.positionsWithoutMaturityDate).toBe(7);
  });

  it("marks effective valuation dates incomplete when a portfolio row has no date", async () => {
    const positions = [
      position("Grupo com data", "300", "LONG_TERM_INVESTMENT", {
        referenceDate: "2026-09-30",
      }),
      position("Grupo sem data", "200", "LONG_TERM_INVESTMENT", {
        referenceDate: null,
      }),
    ];
    const { service } = makeService(positions);

    const result = await service.getOverview();

    expect(result.portfolioWealth.positionCount).toBe(2);
    expect(result.valuationDates).toEqual(["2026-09-30"]);
    expect(result.valuationDatesComplete).toBe(false);
  });

  it("keeps a contribution simulation available without inventing a position valuation date", async () => {
    const { service } = makeService([
      position("CDB", "10000", null, {
        assetClass: "Renda fixa",
        referenceDate: undefined,
      }),
    ]);

    const result = await service.simulateContribution({
      contributionAmount: 20,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });

    expect(result.simulation).toMatchObject({
      totalCents: "10000",
      completeness: { complete: true },
    });
  });

  it("includes every position regardless of legacy destination", async () => {
    const { service } = makeService([
      position("Reserva", null, "RESERVE", { knownValueCents: undefined }),
      position("Unclassified legacy", "250", null, { objectiveId: "legacy" }),
      position("Livre", "100", null, { objectiveId: null }),
    ]);
    const result = await service.getOverview();

    expect(result.totalWealth.knownValueCents).toBe("350");
    expect(result.portfolioWealth).toMatchObject({
      knownValueCents: "350",
      unvaluedPositionCount: 1,
      positionCount: 3,
      unclassifiedKnownValueCents: "350",
    });
    expect(result.maturityDates).toEqual([]);
    expect(result.savedStrategy).toBeNull();
  });

  it("allocates rounding residue so a complete current composition totals 100%", async () => {
    const { service } = makeService([
      position("CDB", "1", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda fixa",
      }),
      position("Ação Brasil", "1", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
      position("ETF Exterior", "1", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Exterior",
      }),
    ]);
    const result = await service.getOverview();
    const percentages = result.portfolioWealth.classes.map(
      ({ percentageBasisPoints }) => percentageBasisPoints,
    );
    expect(percentages).toEqual([3334, 3333, 3333, 0]);
    expect(percentages.reduce((sum, percentage) => sum + percentage, 0)).toBe(
      10000,
    );
  });

  it("counts portfolio position rows and their maturity dates", async () => {
    const grouped = position("CDB DI", "12000", "LONG_TERM_INVESTMENT", {
      maturityAt: "2028-10-02",
    });
    const { service } = makeService([grouped]);
    const result = await service.getOverview();

    expect(result.totalWealth.positionCount).toBe(1);
    expect(result.portfolioWealth).toMatchObject({
      positionCount: 1,
      positionsWithoutMaturityDate: 0,
    });
    expect(result.maturityDates).toEqual([{ date: "2028-10-02", count: 1 }]);
  });

  it("does not infer a value for an unvalued portfolio position", async () => {
    const partial = position("Ação ordinária", null, "LONG_TERM_INVESTMENT", {
      assetClass: "Renda variável",
      geography: "Brasil",
      unvaluedPositions: 1,
    });
    const { service } = makeService([partial]);
    const result = await service.getOverview();

    expect(result.portfolioWealth.knownValueCents).toBe("0");
    expect(result.portfolioWealth.unvaluedPositionCount).toBe(1);
    expect(result.portfolioWealth.classes).toContainEqual(
      expect.objectContaining({
        id: "brazilian_equities",
        knownValueCents: "0",
        percentageBasisPoints: 0,
      }),
    );
  });

  it("falls back to the position value when legacy data lacks known cents", async () => {
    const legacy = position("CDB", "875", "LONG_TERM_INVESTMENT", {
      assetClass: "Renda fixa",
      knownValueCents: undefined,
    });
    const { service } = makeService([legacy]);
    const result = await service.getOverview();

    expect(result.totalWealth.knownValueCents).toBe("875");
    expect(result.portfolioWealth.knownValueCents).toBe("875");
  });

  it("restores persisted answers and the chosen direction", async () => {
    const { service, repository } = makeService([]);
    repository.get.mockResolvedValue(saved);
    const result = await service.getOverview();
    expect(result.savedStrategy).toEqual({
      answers: saved.answers,
      selectedDirection: saved.selectedDirection,
      updatedAt: saved.updatedAt.toISOString(),
    });
  });

  it("persists a valid selected direction separately and returns its timestamp", async () => {
    const { service, repository } = makeService();
    await expect(
      service.save(
        {
          answers: { horizonYears: 4, internationalInterest: "interested" },
          selectedDirection: "consider_international",
        },
        "request-save",
      ),
    ).resolves.toEqual({
      answers: saved.answers,
      selectedDirection: saved.selectedDirection,
      updatedAt: saved.updatedAt.toISOString(),
    });
    expect(repository.save).toHaveBeenCalledWith(
      saved.answers,
      saved.selectedDirection,
      "request-save",
    );
  });

  it("returns the saved composition separately from legacy strategy answers", async () => {
    const { service, repository } = makeService([]);
    repository.get.mockResolvedValue({
      ...saved,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });
    const result = await service.getOverview();
    expect(result.savedAllocationPercentages).toEqual({
      fixed_income: 100,
      brazilian_equities: 0,
      international_etfs: 0,
      fiis: 0,
    });
  });

  it("does not expose an empty legacy profile for a composition-only record", async () => {
    const { service, repository } = makeService([]);
    repository.get.mockResolvedValue({
      answers: null,
      selectedDirection: null,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
      updatedAt: new Date("2026-10-02T10:00:00.000Z"),
    });
    const result = await service.getOverview();
    expect(result.savedStrategy).toBeNull();
    expect(result.savedAllocationPercentages).toEqual({
      fixed_income: 100,
      brazilian_equities: 0,
      international_etfs: 0,
      fiis: 0,
    });
  });

  it("saves a four-class composition including zero-weight classes", async () => {
    const { service, repository } = makeService();
    const percentages = {
      fixed_income: 60,
      brazilian_equities: 40,
      international_etfs: 0,
      fiis: 0,
    };
    await expect(
      service.saveComposition(
        { allocationPercentages: percentages },
        "req-allocation",
      ),
    ).resolves.toEqual(percentages);
    expect(repository.saveAllocationPercentages).toHaveBeenCalledWith(
      percentages,
      "req-allocation",
    );
  });

  it.each([
    null,
    {},
    {
      fixed_income: 90,
      brazilian_equities: 10,
      international_etfs: 0,
      fiis: 0,
      other: 0,
    },
    {
      fixed_income: 90.001,
      brazilian_equities: 9.999,
      international_etfs: 0,
      fiis: 0,
    },
    {
      fixed_income: -1,
      brazilian_equities: 101,
      international_etfs: 0,
      fiis: 0,
    },
    {
      fixed_income: 30,
      brazilian_equities: 30,
      international_etfs: 20,
      fiis: 19,
    },
  ])(
    "rejects malformed saved compositions %j",
    async (allocationPercentages) => {
      const { service, repository } = makeService();
      await expect(
        service.saveComposition({ allocationPercentages }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(repository.saveAllocationPercentages).not.toHaveBeenCalled();
    },
  );

  it("simulates an aporte against the draft composition using whole-portfolio positions", async () => {
    const positions = [
      position("CDB", "6000", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda fixa",
      }),
      position("Ação Brasil", "4000", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Brasil",
      }),
      position("Reserva", "5000", "RESERVE", { assetClass: "Renda fixa" }),
      position("Sem destino", "8000", null, { objectiveId: null }),
    ];
    const { service, positionService, allocationService } =
      makeService(positions);
    const result = await service.simulateContribution(
      {
        contributionAmount: 20,
        allocationPercentages: {
          fixed_income: 50,
          brazilian_equities: 50,
          international_etfs: 0,
          fiis: 0,
        },
      },
      "req-simulate",
    );

    expect(positionService.listCurrentEnriched).toHaveBeenCalledWith(
      "req-simulate",
      "2026-10-02",
    );
    expect(allocationService.classifyPositions).toHaveBeenCalledWith(
      evaluated,
      "req-simulate",
    );
    expect(result).toMatchObject({
      enteredContributionCents: "2000",
      reserveContributionCents: "0",
      strategyContributionCents: "2000",
      reserveStatus: "not_configured",
      simulation: {
        totalCents: "15000",
        contributionCents: "2000",
        allocations: [
          {
            id: "fixed_income",
            currentValueCents: "11000",
            targetPercentage: 50,
            contributionValueCents: "0",
            projectedValueCents: "11000",
          },
          {
            id: "brazilian_equities",
            currentValueCents: "4000",
            targetPercentage: 50,
            contributionValueCents: "2000",
            projectedValueCents: "6000",
          },
          { id: "international_etfs" },
          { id: "fiis" },
        ],
        completeness: {
          complete: false,
          unvaluedPositionCount: 0,
          unclassifiedKnownValueCents: "8000",
          valuationDate: "2026-10-02",
        },
      },
    });
  });

  it.each([
    { differenceCents: "500", amount: 2, reserveCents: "200", remaining: "0" },
    {
      differenceCents: "500",
      amount: 8,
      reserveCents: "500",
      remaining: "300",
    },
    { differenceCents: "0", amount: 8, reserveCents: "0", remaining: "800" },
  ])(
    "prioritizes reserve contributions consistently: $amount",
    async ({ differenceCents, amount, reserveCents, remaining }) => {
      const reserve = {
        ...notConfiguredReserve,
        monthlyExpenses: 100,
        targetMonths: 10,
        targetValue: Number(differenceCents) / 100 + 100,
        targetValueCents: "1000",
        difference: Number(differenceCents) / 100,
        differenceCents,
        status:
          differenceCents === "0"
            ? ("on_target" as const)
            : ("below_target" as const),
      };
      const { service } = makeService([], reserve);
      const result = await service.simulateContribution({
        contributionAmount: amount,
        allocationPercentages: {
          fixed_income: 100,
          brazilian_equities: 0,
          international_etfs: 0,
          fiis: 0,
        },
      });
      expect(result.reserveContributionCents).toBe(reserveCents);
      expect(result.strategyContributionCents).toBe(remaining);
      if (remaining === "0") {
        expect(result.simulation).toBeNull();
      } else {
        expect(result.simulation?.contributionCents).toBe(remaining);
      }
    },
  );

  it("returns an explicit unknown strategy amount when reserve values are incomplete", async () => {
    const { service } = makeService([], {
      ...notConfiguredReserve,
      balance: null,
      monthlyExpenses: 100,
      targetMonths: 10,
      targetValue: 1000,
      difference: null,
      status: "balance_required",
    });
    const result = await service.simulateContribution({
      contributionAmount: 8,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });
    expect(result).toMatchObject({
      reserveStatus: "incomplete",
      reserveContributionCents: null,
      strategyContributionCents: null,
      simulation: null,
    });
  });

  it("does not infer reserve contributions when there is no observed balance", async () => {
    const { service, reserveService } = makeService([], null);

    const result = await service.simulateContribution({
      contributionAmount: 100,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });

    expect(result).toMatchObject({
      enteredContributionCents: "10000",
      reserveContributionCents: null,
      strategyContributionCents: null,
      reserveStatus: "incomplete",
      reserveSelectedValueCents: null,
      reserveTargetValueCents: null,
      reserveDifferenceCents: null,
      simulation: null,
    });
    expect(reserveService.getContributionContext).toHaveBeenCalledWith();
  });

  it("accepts a cent-precise decimal whose binary representation is inexact", async () => {
    const { service } = makeService([]);
    const result = await service.simulateContribution({
      contributionAmount: 0.29,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });
    expect(result.simulation?.contributionCents).toBe("29");
  });

  it.each([
    {
      contributionAmount: 0,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    },
    {
      contributionAmount: 1.001,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    },
    { contributionAmount: 1, allocationPercentages: {} },
    {
      contributionAmount: 1,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
        extra: 0,
      },
    },
  ])("rejects invalid contribution simulations %j", async (body) => {
    const { service } = makeService();
    await expect(service.simulateContribution(body)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("marks contribution projections incomplete when portfolio values lack coverage", async () => {
    const { service } = makeService([
      position("Unknown long-term asset", "250", "LONG_TERM_INVESTMENT", {
        knownValueCents: undefined,
      }),
      position("Unvalued CDB", null, "LONG_TERM_INVESTMENT", {
        knownValueCents: undefined,
      }),
    ]);
    const result = await service.simulateContribution({
      contributionAmount: 10,
      allocationPercentages: {
        fixed_income: 100,
        brazilian_equities: 0,
        international_etfs: 0,
        fiis: 0,
      },
    });
    expect(result.simulation?.completeness).toMatchObject({
      complete: false,
      unvaluedPositionCount: 1,
      unclassifiedKnownValueCents: "250",
    });
  });

  it("rejects a direction hidden by the user's international preference", async () => {
    const { service, repository } = makeService();
    await expect(
      service.save({
        answers: { horizonYears: 3, internationalInterest: "not_interested" },
        selectedDirection: "consider_international",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    {
      answers: { horizonYears: 0, internationalInterest: "interested" },
      selectedDirection: "review_horizon",
    },
    {
      answers: { horizonYears: 3.5, internationalInterest: "unsure" },
      selectedDirection: "review_horizon",
    },
    {
      answers: { horizonYears: 3, internationalInterest: "unknown" },
      selectedDirection: "review_horizon",
    },
    {
      answers: { horizonYears: 3, internationalInterest: "unsure" },
      selectedDirection: "other",
    },
  ])("rejects invalid strategy input %j", async (body) => {
    const { service, repository } = makeService();
    await expect(service.save(body)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});
