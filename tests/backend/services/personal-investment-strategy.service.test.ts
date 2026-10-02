import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { PersonalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";

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
  objectiveId: objectivePurpose ? "assigned" : null,
  objectivePurpose,
  assetClass: null,
  geography: null,
  maturityAt: null,
  estimatedThrough: null,
  referenceDate: "2026-09-30",
  unvaluedPositions: valueCents === null ? 1 : 0,
  ...overrides,
});

const saved = {
  answers: { horizonYears: 4, internationalInterest: "interested" as const },
  selectedDirection: "consider_international" as const,
  updatedAt: new Date("2026-10-02T10:00:00.000Z"),
};

function makeService(positions: ReturnType<typeof position>[] = []) {
  const positionService = {
    listCurrentEnriched: vi.fn().mockResolvedValue(evaluated),
  };
  const allocationService = {
    classifyPositions: vi.fn().mockResolvedValue([{ classification: {} }]),
  };
  const objectivesService = {
    getOverview: vi.fn().mockResolvedValue({ positions, objectives: [] }),
  };
  const repository = {
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(saved),
  };
  const service = new PersonalInvestmentStrategyService(
    positionService as never,
    allocationService as never,
    objectivesService as never,
    repository as never,
    () => "2026-10-02",
  );
  return {
    service,
    positionService,
    allocationService,
    objectivesService,
    repository,
  };
}

describe("PersonalInvestmentStrategyService", () => {
  it("uses one canonical valuation snapshot and includes only explicitly long-term destinations", async () => {
    const positions = [
      position("CDB", "100", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda fixa",
        maturityAt: "2028-10-02",
      }),
      position("Ação", "200", "LONG_TERM_INVESTMENT", {
        assetClass: "Renda variável",
        geography: "Brasil",
        maturityAt: "2032-10-02",
      }),
      position("ETF Exterior", "300", "LONG_TERM_INVESTMENT", {
        geography: "Exterior",
        maturityAt: "2027-10-02",
      }),
      position("FII", "400", "LONG_TERM_INVESTMENT"),
      position("Outro ativo", "500", "LONG_TERM_INVESTMENT"),
      position("Sem valor", null, "LONG_TERM_INVESTMENT"),
      position("Meta pessoal", "600", "PERSONAL_GOAL"),
      position("Reserva", "700", "RESERVE"),
      position("Objetivo antigo", "800", null, { objectiveId: "legacy" }),
      position("Sem destino", "900", null, { objectiveId: null }),
    ];
    const { service, positionService, allocationService, objectivesService } =
      makeService(positions);
    objectivesService.getOverview.mockResolvedValueOnce({
      positions,
      objectives: [
        { kind: "CUSTOM", purpose: null },
        { kind: "RESERVE", purpose: null },
        { kind: "CUSTOM", purpose: "PERSONAL_GOAL" },
      ],
    });
    const result = await service.getOverview("request-1");

    expect(positionService.listCurrentEnriched).toHaveBeenCalledWith(
      "request-1",
      "2026-10-02",
    );
    expect(allocationService.classifyPositions).toHaveBeenCalledWith(
      evaluated,
      "request-1",
    );
    expect(objectivesService.getOverview).toHaveBeenCalledWith(
      "request-1",
      "2026-10-02",
      [{ classification: {} }],
    );
    expect(result.totalWealth).toEqual({
      knownValueCents: "4500",
      unvaluedPositionCount: 1,
      positionCount: 10,
    });
    expect(result.longTermWealth.knownValueCents).toBe("1500");
    expect(result.longTermWealth.positionCount).toBe(6);
    expect(result.longTermWealth.assignedPositionCount).toBe(6);
    expect(result.longTermWealth.unvaluedPositionCount).toBe(1);
    expect(result.longTermWealth.classes).toEqual([
      { id: "fixed_income", label: "Renda fixa", knownValueCents: "100" },
      {
        id: "brazilian_equities",
        label: "Ações brasileiras",
        knownValueCents: "200",
      },
      {
        id: "international_etfs",
        label: "ETFs internacionais",
        knownValueCents: "300",
      },
      { id: "fiis", label: "FIIs", knownValueCents: "400" },
    ]);
    expect(result.longTermWealth.unclassifiedKnownValueCents).toBe("500");
    expect(result.longTermMaturityDates).toEqual([
      { date: "2027-10-02", count: 1 },
      { date: "2028-10-02", count: 1 },
      { date: "2032-10-02", count: 1 },
    ]);
    expect(result.longTermPositionsWithoutMaturityDate).toBe(3);
    expect(result.destinationsNeedingPurposeConfirmation).toBe(1);
  });

  it("returns empty zero-known totals without treating any position as long-term", async () => {
    const { service } = makeService([
      position("Reserva", null, "RESERVE"),
      position("Unclassified legacy", "250", null, { objectiveId: "legacy" }),
      position("Livre", "100", null, { objectiveId: null }),
    ]);
    const result = await service.getOverview();

    expect(result.totalWealth.knownValueCents).toBe("350");
    expect(result.longTermWealth).toMatchObject({
      knownValueCents: "0",
      unvaluedPositionCount: 0,
      positionCount: 0,
      assignedPositionCount: 0,
      unclassifiedKnownValueCents: "0",
    });
    expect(result.longTermMaturityDates).toEqual([]);
    expect(result.savedStrategy).toBeNull();
  });

  it("counts underlying lots when an objective overview groups positions by asset", async () => {
    const grouped = position("CDB DI", "12000", "LONG_TERM_INVESTMENT", {
      positionCount: 3,
      maturityAt: "2028-10-02",
    });
    const { service } = makeService([grouped]);
    const result = await service.getOverview();

    expect(result.totalWealth.positionCount).toBe(3);
    expect(result.longTermWealth).toMatchObject({
      positionCount: 3,
      assignedPositionCount: 3,
      positionsWithoutMaturityDate: 0,
    });
    expect(result.longTermMaturityDates).toEqual([
      { date: "2028-10-02", count: 3 },
    ]);
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
