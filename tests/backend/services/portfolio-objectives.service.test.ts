import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCurrentEnriched: vi.fn(),
  classifyPositions: vi.fn(),
  getSettings: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getObjective: vi.fn(),
  replaceAssignments: vi.fn(),
  replaceAssignmentsWithTransfers: vi.fn(),
  listLatestBalanceReferences: vi.fn(),
  saveGlobalAllocation: vi.fn(),
  fingerprint: vi.fn((input: unknown) => {
    const serialized = JSON.stringify(input);
    let value = 0;
    for (const character of serialized)
      value = (value * 31 + character.charCodeAt(0)) >>> 0;
    return value.toString(16).padStart(64, "0");
  }),
}));

vi.mock("@/backend/services/portfolio-position.service", () => ({
  portfolioPositionService: { listCurrentEnriched: mocks.listCurrentEnriched },
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: { classifyPositions: mocks.classifyPositions },
}));
vi.mock("@/backend/repositories/emergency-reserve.repository", () => ({
  emergencyReserveRepository: { getSettings: mocks.getSettings },
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  createAllocationSourceFingerprint: mocks.fingerprint,
  portfolioObjectivesRepository: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    getObjective: mocks.getObjective,
    replaceAssignments: mocks.replaceAssignments,
    replaceAssignmentsWithTransfers: mocks.replaceAssignmentsWithTransfers,
    listLatestBalanceReferences: mocks.listLatestBalanceReferences,
    saveGlobalAllocation: mocks.saveGlobalAllocation,
  },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { PortfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const imported = (overrides: Record<string, unknown> = {}) => ({
  product: "CDB DI",
  assetCode: "CDB1",
  institution: "Banco A",
  issuer: "Banco A S.A.",
  indexer: "DI",
  regimeType: "PÓS-FIXADO",
  issuedAt: "2025-01-01",
  maturityAt: "2028-01-01",
  totalValue: "100",
  estimatedValue: null,
  referenceDate: "2026-09-30",
  source: "B3",
  classification: { assetClass: "Renda fixa" },
  ...overrides,
});

const customObjective = {
  id: "objective-trip",
  kind: "CUSTOM",
  name: "Viagem",
  targetAmount: "500.00",
  monthlyPlannedAmount: "100.00",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("PortfolioObjectivesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCurrentEnriched.mockResolvedValue([]);
    mocks.classifyPositions.mockImplementation(async (positions) => positions);
    mocks.getSettings.mockResolvedValue(null);
    mocks.list.mockResolvedValue({ objectives: [], assignments: [] });
    mocks.listLatestBalanceReferences.mockResolvedValue([]);
    mocks.getObjective.mockResolvedValue(customObjective);
    mocks.create.mockResolvedValue(customObjective);
    mocks.replaceAssignmentsWithTransfers.mockResolvedValue(undefined);
  });

  it("builds the overview from a supplied evaluated position snapshot", async () => {
    const evaluatedPositions = [
      imported({ canonicalValueCents: "12345", estimatedValue: 123.45 }),
    ];

    const result = await new PortfolioObjectivesService().getOverview(
      "request-1",
      "2026-09-30",
      evaluatedPositions,
    );

    expect(result.positions[0]).toMatchObject({
      value: 123.45,
      valueCents: "12345",
    });
    expect(mocks.listCurrentEnriched).not.toHaveBeenCalled();
    expect(mocks.classifyPositions).not.toHaveBeenCalled();
  });

  it("uses the Sao Paulo valuation date when an allocation fingerprint is requested without a date", async () => {
    const result = await new PortfolioObjectivesService().getOverview(
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(
      (result as typeof result & { allocationSourceFingerprint: string })
        .allocationSourceFingerprint,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.fingerprint).toHaveBeenCalledWith(
      expect.objectContaining({
        valuationDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it("uses canonical cents for unassigned objective totals", async () => {
    mocks.listCurrentEnriched.mockResolvedValue([
      imported({
        canonicalValueCents: "12345",
        canonicalValueSource: "CDB_ESTIMATE",
      }),
    ]);

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.unassignedKnownValue).toBe(123.45);
    expect(result.unassignedKnownValueCents).toBe("12345");
    expect(result.positions[0]).toMatchObject({
      value: 123.45,
      valueCents: "12345",
    });
  });

  it("handles canonical valued and unvalued positions with incomplete metadata", async () => {
    const valued = imported({
      canonicalValueCents: "10000",
      canonicalValueSource: undefined,
      totalValue: "1",
    });
    const key = getEmergencyReserveAssetKey(valued);
    mocks.listCurrentEnriched.mockResolvedValue([valued]);
    mocks.list.mockResolvedValue({
      objectives: [
        {
          ...customObjective,
          targetAmount: "50.00",
          monthlyPlannedAmount: "bad",
        },
      ],
      assignments: [{ objectiveId: customObjective.id, assetKey: key }],
    });

    const valuedResult = await new PortfolioObjectivesService().getOverview();

    expect(valuedResult.objectives[0]).toMatchObject({
      currentValueCents: "10000",
      remainingAmountCents: "0",
      progressPercent: 100,
      monthlyPlannedAmount: 0,
      monthlyPlannedAmountCents: null,
    });

    const unvalued = imported({
      assetCode: "CDB2",
      canonicalValueCents: null,
      totalValue: "100",
    });
    mocks.listCurrentEnriched.mockResolvedValue([unvalued]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective],
      assignments: [
        {
          objectiveId: customObjective.id,
          assetKey: getEmergencyReserveAssetKey(unvalued),
        },
      ],
    });

    const unvaluedResult = await new PortfolioObjectivesService().getOverview();

    expect(unvaluedResult.objectives[0]).toMatchObject({
      currentValue: null,
      currentValueCents: null,
      unvaluedPositionCount: 1,
    });
  });

  it("builds objective progress from current position values and reports unassigned wealth", async () => {
    const first = imported();
    const duplicate = imported({ totalValue: "50" });
    const manual = imported({
      assetKey: "manual:asset",
      source: "MANUAL",
      product: "ETF",
      assetCode: "ETF1",
      totalValue: "300",
      convertedValueBrl: "300",
      institution: "Corretora",
      issuer: null,
      indexer: null,
      regimeType: null,
      issuedAt: null,
      maturityAt: null,
    });
    const key = getEmergencyReserveAssetKey(first);
    mocks.listCurrentEnriched.mockResolvedValue([first, duplicate, manual]);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "200.00",
      targetMonths: 6,
      selectedAssetKeys: [],
    });
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        {
          ...customObjective,
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: null,
          monthlyPlannedAmount: null,
        },
      ],
      assignments: [{ objectiveId: customObjective.id, assetKey: key }],
    });

    const result = await new PortfolioObjectivesService().getOverview("r1");

    expect(result.objectives[0]).toMatchObject({
      currentValue: 150,
      targetAmount: 500,
      remainingAmount: 350,
      progressPercent: 30,
      assignedPositionCount: 2,
      monthlyPlannedAmount: 100,
    });
    expect(result.objectives[1]).toMatchObject({
      targetAmount: 1200,
      currentValue: 0,
    });
    expect(result.positions[0]).toMatchObject({
      objectiveId: customObjective.id,
    });
    expect(result.unassignedKnownValue).toBe(300);
    expect(result.unassignedPositionCount).toBe(1);
  });

  it("keeps stale and unvalued objective values unavailable", async () => {
    const noValue = imported({ totalValue: null });
    mocks.listCurrentEnriched.mockResolvedValue([noValue]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective],
      assignments: [
        {
          objectiveId: customObjective.id,
          assetKey: getEmergencyReserveAssetKey(noValue),
        },
        { objectiveId: customObjective.id, assetKey: "v1:stale" },
      ],
    });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      currentValue: null,
      remainingAmount: null,
      progressPercent: null,
      missingPositionCount: 1,
      unvaluedPositionCount: 1,
    });
  });

  it("retains known subtotal for a mixed-valued position group without claiming full progress", async () => {
    const valued = imported({
      estimationBaseDate: "2026-09-16",
      estimatedThrough: "2026-09-21",
      cdbEstimateStatus: "provisional",
    });
    const unvalued = imported({
      totalValue: null,
      estimationBaseDate: null,
      estimatedThrough: null,
      cdbEstimateStatus: "unavailable",
      cdbEstimateLimitation: "Data-base CURVA não confirmada.",
    });
    const other = imported({
      assetCode: "CDB2",
      totalValue: "300",
      issuer: "Banco B S.A.",
      institution: "Banco B",
    });
    const key = getEmergencyReserveAssetKey(valued);
    mocks.listCurrentEnriched.mockResolvedValue([valued, unvalued, other]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective],
      assignments: [{ objectiveId: customObjective.id, assetKey: key }],
    });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      currentValue: null,
      knownValue: 100,
      unvaluedPositionCount: 1,
      progressPercent: null,
      remainingAmount: null,
    });
    expect(
      result.positions.find((position) => position.assetKey === key),
    ).toMatchObject({
      value: null,
      knownValue: 100,
      unvaluedPositions: 1,
      estimationBaseDate: null,
      estimatedThrough: null,
      cdbEstimateStatus: null,
      cdbEstimateLimitation: "Data-base CURVA não confirmada.",
    });
    expect(result.unassignedKnownValue).toBe(300);
  });

  it("clears grouped comparison metadata when lots have different approximation states", async () => {
    const first = imported({
      cdbEstimateComparisonApproximate: true,
      estimatedThrough: "2026-09-18",
    });
    const second = imported({
      totalValue: "125",
      cdbEstimateComparisonApproximate: false,
      estimatedThrough: "2026-09-19",
    });
    mocks.listCurrentEnriched.mockResolvedValue([first, second]);

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      positionCount: 2,
      cdbEstimateComparisonApproximate: null,
      estimatedThrough: null,
    });
  });

  it("retains the known subtotal when an unvalued lot precedes a valued lot", async () => {
    const unvalued = imported({ totalValue: null });
    const valued = imported({ totalValue: "75" });
    const key = getEmergencyReserveAssetKey(valued);
    mocks.listCurrentEnriched.mockResolvedValue([unvalued, valued]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective],
      assignments: [{ objectiveId: customObjective.id, assetKey: key }],
    });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      currentValue: null,
      knownValue: 75,
      unvaluedPositionCount: 1,
      progressPercent: null,
    });
    expect(result.positions[0]).toMatchObject({
      value: null,
      knownValue: 75,
      unvaluedPositions: 1,
    });
  });

  it("handles unclassified positions with unavailable or invalid values", async () => {
    const unavailableIdentity = imported({
      issuer: null,
      indexer: null,
      regimeType: null,
      issuedAt: null,
      maturityAt: null,
      classification: null,
      referenceDate: null,
      source: null,
      totalValue: "not-a-number",
    });
    mocks.listCurrentEnriched.mockResolvedValue([unavailableIdentity]);
    mocks.list.mockResolvedValue({ objectives: [], assignments: [] });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.positions[0]).toMatchObject({
      assetClass: null,
      value: null,
      knownValue: 0,
      unvaluedPositions: 1,
      referenceDate: null,
      source: null,
    });
    expect(result.unassignedKnownValue).toBe(0);
    expect(result.unassignedUnvaluedPositionCount).toBe(1);
  });

  it("leaves the reserve and custom target unavailable until their targets are configured", async () => {
    mocks.list.mockResolvedValue({
      objectives: [
        { ...customObjective, targetAmount: null },
        {
          ...customObjective,
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: null,
          monthlyPlannedAmount: null,
        },
      ],
      assignments: [],
    });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives.map(({ targetAmount }) => targetAmount)).toEqual([
      null,
      null,
    ]);
    expect(
      result.objectives.every(({ currentValue }) => currentValue === 0),
    ).toBe(true);
  });

  it("creates a named objective with a target and optional monthly plan", async () => {
    await expect(
      new PortfolioObjectivesService().create({
        name: " Viagem ",
        targetAmount: 12000,
        monthlyPlannedAmount: 500,
      }),
    ).resolves.toEqual(customObjective);
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Viagem",
      targetAmount: "12000.00",
      monthlyPlannedAmount: "500.00",
    });
  });

  it("stores an omitted monthly plan as null", async () => {
    await new PortfolioObjectivesService().create({
      name: "Longo prazo",
      targetAmount: 5000,
    });

    expect(mocks.create).toHaveBeenCalledWith({
      name: "Longo prazo",
      targetAmount: "5000.00",
      monthlyPlannedAmount: null,
    });
  });

  it("creates a destination without a target or monthly plan", async () => {
    await new PortfolioObjectivesService().create({ name: "Longo prazo" });

    expect(mocks.create).toHaveBeenCalledWith({
      name: "Longo prazo",
      targetAmount: null,
      monthlyPlannedAmount: null,
    });
  });

  it("clears an optional target without changing objective assignments", async () => {
    const id = "d755114d-f6ad-45a2-a5f6-95e5e18dd6f0";
    mocks.getObjective.mockResolvedValueOnce({ ...customObjective, id });
    mocks.update.mockResolvedValue({
      ...customObjective,
      id,
      targetAmount: null,
    });

    await expect(
      new PortfolioObjectivesService().update(id, {
        name: "Viagem",
      }),
    ).resolves.toMatchObject({ targetAmount: null });

    expect(mocks.update).toHaveBeenCalledWith(id, {
      name: "Viagem",
      targetAmount: null,
      monthlyPlannedAmount: null,
    });
    expect(mocks.replaceAssignments).not.toHaveBeenCalled();
  });

  it("updates custom objective details without replacing its assignments", async () => {
    const id = "d755114d-f6ad-45a2-a5f6-95e5e18dd6f0";
    mocks.getObjective.mockResolvedValueOnce({ ...customObjective, id });
    mocks.update.mockResolvedValue({ ...customObjective, id, name: "Carro" });

    await expect(
      new PortfolioObjectivesService().update(id, {
        name: " Carro ",
        targetAmount: 25000,
        monthlyPlannedAmount: null,
      }),
    ).resolves.toMatchObject({ name: "Carro" });
    expect(mocks.update).toHaveBeenCalledWith(id, {
      name: "Carro",
      targetAmount: "25000.00",
      monthlyPlannedAmount: null,
    });
    expect(mocks.replaceAssignments).not.toHaveBeenCalled();
  });

  it.each(["update", "delete"] as const)(
    "protects the reserve from %s",
    async (operation) => {
      mocks.getObjective.mockResolvedValueOnce({
        ...customObjective,
        id: reserveObjectiveId,
      });
      const service = new PortfolioObjectivesService();
      const run =
        operation === "update"
          ? service.update(reserveObjectiveId, {
              name: "Reserva",
              targetAmount: 100,
            })
          : service.delete(reserveObjectiveId, {
              objectiveId: reserveObjectiveId,
            });

      await expect(run).rejects.toBeInstanceOf(ApplicationError);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    },
  );

  it("deletes a custom objective and leaves assignment deletion to the database cascade", async () => {
    const id = "d755114d-f6ad-45a2-a5f6-95e5e18dd6f0";
    mocks.getObjective.mockResolvedValueOnce({ ...customObjective, id });
    mocks.delete.mockResolvedValue({ ...customObjective, id });

    await expect(
      new PortfolioObjectivesService().delete(id, { objectiveId: id }),
    ).resolves.toMatchObject({ id });
  });

  it("searches only unassigned positions and limits confident CDB search by classification and product", async () => {
    const cdb1 = imported({
      totalValue: "40",
      canonicalValueCents: "4000",
      canonicalValueSource: "CDB_ESTIMATE",
      estimationBaseDate: "2026-09-16",
      estimatedThrough: "2026-09-18",
      cdbEstimateStatus: "provisional",
      cdbEstimateLimitation: "Taxa CDI ainda não publicada.",
    });
    const cdb2 = imported({
      assetCode: "CDB2",
      issuer: "Banco B S.A.",
      institution: "Banco B",
      totalValue: "60",
      canonicalValueCents: "6000",
      canonicalValueSource: "B3_IMPORTED",
      estimationBaseDate: "2026-09-16",
      estimatedThrough: "2026-09-18",
      cdbEstimateStatus: "complete",
    });
    const unknownFixedIncome = imported({
      assetCode: "UNKNOWN",
      product: "Produto não identificado",
      totalValue: "100",
    });
    const unclassifiedCdb = imported({
      assetCode: "CDB3",
      issuer: "Banco C S.A.",
      institution: "Banco C",
      classification: null,
      totalValue: "100",
    });
    const assignedCdb = imported({
      assetCode: "CDB4",
      issuer: "Banco D S.A.",
      institution: "Banco D",
      totalValue: "100",
    });
    const reserveAssignedCdb = imported({
      assetCode: "CDB5",
      issuer: "Banco E S.A.",
      institution: "Banco E",
      totalValue: "100",
    });
    const assignedKey = getEmergencyReserveAssetKey(assignedCdb);
    const reserveAssignedKey = getEmergencyReserveAssetKey(reserveAssignedCdb);
    mocks.listCurrentEnriched.mockResolvedValue([
      cdb1,
      cdb2,
      unknownFixedIncome,
      unclassifiedCdb,
      assignedCdb,
      reserveAssignedCdb,
    ]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective],
      assignments: [
        { objectiveId: customObjective.id, assetKey: assignedKey },
        { objectiveId: reserveObjectiveId, assetKey: reserveAssignedKey },
      ],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        instrumentType: "CDB",
      });

    expect(result).toMatchObject({ status: "suggestions", kind: "exact" });
    if (result.status === "suggestions") {
      expect([...result.candidates[0].assetKeys].sort()).toEqual(
        [
          getEmergencyReserveAssetKey(cdb1),
          getEmergencyReserveAssetKey(cdb2),
        ].sort(),
      );
      expect(result.candidates[0].assetKeys).not.toContain(assignedKey);
      expect(result.candidates[0].assetKeys).not.toContain(reserveAssignedKey);
      expect(result.candidates[0].positions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetKey: getEmergencyReserveAssetKey(cdb1),
            valueCents: "4000",
            canonicalValueSource: "CDB_ESTIMATE",
            cdbEstimateLimitation: "Taxa CDI ainda não publicada.",
          }),
          expect.objectContaining({
            assetKey: getEmergencyReserveAssetKey(cdb2),
            valueCents: "6000",
            canonicalValueSource: "B3_IMPORTED",
          }),
        ]),
      );
    }
  });

  it("rejects invalid suggestion and objective update input before persistence", async () => {
    const service = new PortfolioObjectivesService();

    await expect(
      service.findPositionCombinations({ targetAmount: 0 }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.update("objective-trip", { name: "", targetAmount: -1 }),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.getObjective).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("supports all unassigned suggestions and validates update outcomes", async () => {
    const position = imported({ totalValue: "100" });
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({ objectives: [], assignments: [] });
    const service = new PortfolioObjectivesService();
    await expect(
      service.findPositionCombinations({
        targetAmount: 100,
        instrumentType: "ALL",
      }),
    ).resolves.toMatchObject({ status: "suggestions", kind: "exact" });

    mocks.listCurrentEnriched.mockResolvedValue([
      imported({ totalValue: null }),
    ]);
    await expect(
      service.findPositionCombinations({
        targetAmount: 100,
        instrumentType: "ALL",
      }),
    ).resolves.toMatchObject({ status: "no_valued_positions" });

    const missingId = "d755114d-f6ad-45a2-a5f6-95e5e18dd6f0";
    mocks.getObjective.mockResolvedValueOnce(null);
    await expect(
      service.update(missingId, {
        name: "Viagem",
        targetAmount: 100,
        monthlyPlannedAmount: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    mocks.getObjective.mockResolvedValueOnce({
      ...customObjective,
      id: missingId,
    });
    mocks.update.mockResolvedValueOnce(null);
    await expect(
      service.update(missingId, {
        name: "Viagem",
        targetAmount: 100,
        monthlyPlannedAmount: 5,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.update).toHaveBeenCalledWith(missingId, {
      name: "Viagem",
      targetAmount: "100.00",
      monthlyPlannedAmount: "5.00",
    });

    mocks.getObjective.mockResolvedValueOnce(null);
    await expect(
      service.delete(missingId, { objectiveId: missingId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    mocks.getObjective.mockResolvedValueOnce({
      ...customObjective,
      id: missingId,
    });
    mocks.delete.mockResolvedValueOnce(null);
    await expect(
      service.delete(missingId, { objectiveId: missingId }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("includes owned positions as explicit transfer candidates using the requested valuation date", async () => {
    const targetPosition = imported({
      assetCode: "TARGET",
      totalValue: "30.00",
      canonicalValueCents: "3000",
    });
    const freePosition = imported({
      assetCode: "FREE",
      totalValue: "10.00",
      canonicalValueCents: "1000",
    });
    const sourcePosition = imported({
      assetCode: "SOURCE",
      totalValue: "60.00",
      canonicalValueCents: "6000",
    });
    const sourceRemainder = imported({
      assetCode: "SOURCE-REMAINDER",
      totalValue: "30.00",
      canonicalValueCents: "3000",
    });
    const targetKey = getEmergencyReserveAssetKey(targetPosition);
    const sourceKey = getEmergencyReserveAssetKey(sourcePosition);
    mocks.listCurrentEnriched.mockResolvedValue([
      targetPosition,
      freePosition,
      sourcePosition,
      sourceRemainder,
    ]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: "objective-home", name: "Casa" },
      ],
      assignments: [
        { objectiveId: customObjective.id, assetKey: targetKey },
        { objectiveId: "objective-home", assetKey: sourceKey },
        {
          objectiveId: "objective-home",
          assetKey: getEmergencyReserveAssetKey(sourceRemainder),
        },
      ],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 90,
        objectiveId: customObjective.id,
        valuationDate: "2026-09-30",
      });

    expect(mocks.listCurrentEnriched).toHaveBeenCalledWith(
      undefined,
      "2026-09-30",
    );
    expect(result).toMatchObject({ status: "suggestions", kind: "exact" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    const transferred = result.candidates.find(
      (candidate) =>
        candidate.assetKeys.includes(targetKey) &&
        candidate.transfers?.some(
          (transfer) => transfer.assetKey === sourceKey,
        ),
    );
    expect(transferred?.assetKeys).toEqual(
      expect.arrayContaining([targetKey, sourceKey]),
    );
    expect(transferred?.transfers).toEqual([
      expect.objectContaining({
        assetKey: sourceKey,
        fromObjectiveId: "objective-home",
        fromObjectiveName: "Casa",
        toObjectiveId: customObjective.id,
      }),
    ]);
    expect(transferred?.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectiveId: "objective-home",
          currentValue: 30,
          knownValue: 30,
        }),
        expect.objectContaining({
          objectiveId: customObjective.id,
          currentValue: 90,
        }),
      ]),
    );
    expect(transferred?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetKey: sourceKey, valueCents: "6000" }),
      ]),
    );
  });

  it("finds an exact objective transfer missed by the former 50,000-node search", async () => {
    const free = [
      ...Array.from({ length: 18 }, (_, index) =>
        imported({
          assetCode: `FREE-HIGH-${String(index).padStart(2, "0")}`,
          totalValue: "19",
          canonicalValueCents: "1900",
        }),
      ),
      ...Array.from({ length: 17 }, (_, index) =>
        imported({
          assetCode: `FREE-LOW-${String(index).padStart(2, "0")}`,
          totalValue: "5",
          canonicalValueCents: "500",
        }),
      ),
    ];
    const assigned = [
      imported({
        assetCode: "TRIP-LOW-TRANSFER",
        totalValue: "5",
        canonicalValueCents: "500",
      }),
    ];
    const sourceId = "objective-source";
    const sourceObjective = {
      ...customObjective,
      id: sourceId,
      name: "Viagem",
    };
    const transferredKeys = assigned.map(getEmergencyReserveAssetKey);
    mocks.listCurrentEnriched.mockResolvedValue([...free, ...assigned]);
    mocks.list.mockResolvedValue({
      objectives: [customObjective, sourceObjective],
      assignments: transferredKeys.map((assetKey) => ({
        objectiveId: sourceId,
        assetKey,
      })),
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 90,
        objectiveId: customObjective.id,
        instrumentType: "ALL",
      });

    expect(result).toMatchObject({ status: "suggestions", kind: "exact" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.searchLimited).toBe(false);
    expect(result.candidates[0].transfers).toHaveLength(1);
    expect(result.candidates[0].transfers?.[0]).toMatchObject({
      fromObjectiveId: sourceId,
      fromObjectiveName: "Viagem",
      toObjectiveId: customObjective.id,
    });
    expect(result.candidates[0].totalCents).toBe("9000");
  });

  it("reports expanded search limits for valued and empty objective baselines", async () => {
    const assigned = Array.from({ length: 40 }, (_, index) =>
      imported({
        assetCode: `OTHER-${String(index).padStart(2, "0")}`,
        totalValue: "1",
        canonicalValueCents: "100",
      }),
    );
    const sourceId = "objective-many";
    const source = { ...customObjective, id: sourceId, name: "Viagem" };
    const assignments = assigned.map((position) => ({
      objectiveId: sourceId,
      assetKey: getEmergencyReserveAssetKey(position),
    }));
    const service = new PortfolioObjectivesService();
    mocks.list.mockResolvedValue({
      objectives: [customObjective, source],
      assignments,
    });
    mocks.listCurrentEnriched.mockResolvedValue([
      imported({
        assetCode: "FREE-90",
        totalValue: "90",
        canonicalValueCents: "9000",
      }),
      ...assigned,
    ]);

    await expect(
      service.findPositionCombinations({
        objectiveId: customObjective.id,
        targetAmount: 100,
        instrumentType: "ALL",
      }),
    ).resolves.toMatchObject({
      status: "suggestions",
      searchLimited: true,
      candidates: [{ total: 90, difference: 10 }],
    });

    const onlyAssigned = Array.from({ length: 41 }, (_, index) =>
      imported({
        assetCode: `ALL-OTHER-${String(index).padStart(2, "0")}`,
        totalValue: "1",
        canonicalValueCents: "100",
      }),
    );
    mocks.list.mockResolvedValue({
      objectives: [customObjective, source],
      assignments: onlyAssigned.map((position) => ({
        objectiveId: sourceId,
        assetKey: getEmergencyReserveAssetKey(position),
      })),
    });
    mocks.listCurrentEnriched.mockResolvedValue(onlyAssigned);

    await expect(
      service.findPositionCombinations({
        objectiveId: customObjective.id,
        targetAmount: 100,
        instrumentType: "ALL",
      }),
    ).resolves.toMatchObject({ status: "too_many_positions", maximum: 40 });
  });

  it("keeps the objective baseline when a transfer candidate only ties its difference", async () => {
    const free = [
      imported({
        assetCode: "FREE-TIE-LOW",
        totalValue: "99",
        canonicalValueCents: "9900",
      }),
      imported({
        assetCode: "FREE-TIE-HIGH",
        totalValue: "101",
        canonicalValueCents: "10100",
      }),
    ];
    const assigned = imported({
      assetCode: "SOURCE-TIE",
      totalValue: "500",
      canonicalValueCents: "50000",
    });
    const sourceId = "objective-tie-source";
    const freeKeys = free.map(getEmergencyReserveAssetKey);
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listCurrentEnriched.mockResolvedValue([...free, assigned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Viagem" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: assignedKey }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        objectiveId: customObjective.id,
        targetAmount: 100,
        instrumentType: "ALL",
      });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
    });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(
      result.candidates.map((candidate) => candidate.assetKeys[0]).sort(),
    ).toEqual([...freeKeys].sort());
    expect(result.candidates.every((candidate) => !candidate.transfers)).toBe(
      true,
    );
  });

  it("rejects deletion requests with an invalid objective id", async () => {
    await expect(
      new PortfolioObjectivesService().delete("not-a-uuid", {}),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.getObjective).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it.each([
    { name: "", targetAmount: 100 },
    { name: "Viagem", targetAmount: 0 },
    { name: "Viagem", targetAmount: 100, monthlyPlannedAmount: -1 },
  ])("rejects invalid objective input", async (body) => {
    await expect(
      new PortfolioObjectivesService().create(body),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("validates assignments and refuses editing the reserve outside its editor", async () => {
    const service = new PortfolioObjectivesService();
    await expect(
      service.updateAssignments("objective-trip", {}),
    ).rejects.toBeInstanceOf(ApplicationError);
    mocks.getObjective.mockResolvedValueOnce(null);
    await expect(
      service.updateAssignments("missing", { assetKeys: [] }),
    ).rejects.toMatchObject({ statusCode: 404 });
    mocks.getObjective.mockResolvedValueOnce({
      ...customObjective,
      id: reserveObjectiveId,
    });
    await expect(
      service.updateAssignments(reserveObjectiveId, { assetKeys: [] }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("rejects stale or already assigned positions and saves a valid unique assignment", async () => {
    const position = imported();
    const key = getEmergencyReserveAssetKey(position);
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    const service = new PortfolioObjectivesService();

    await expect(
      service.updateAssignments("objective-trip", {
        assetKeys: ["not-current"],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    mocks.list.mockResolvedValueOnce({
      objectives: [customObjective],
      assignments: [{ objectiveId: reserveObjectiveId, assetKey: key }],
    });
    await expect(
      service.updateAssignments("objective-trip", { assetKeys: [key] }),
    ).rejects.toMatchObject({ statusCode: 409 });

    mocks.list.mockResolvedValueOnce({
      objectives: [customObjective],
      assignments: [],
    });
    await expect(
      service.updateAssignments("objective-trip", { assetKeys: [key, key] }),
    ).resolves.toBeUndefined();
    expect(mocks.replaceAssignmentsWithTransfers).toHaveBeenCalledWith(
      "objective-trip",
      [key],
      [],
    );
  });

  it("requires and forwards the explicitly confirmed current-owner transfer", async () => {
    const targetId = "00000000-0000-4000-8000-000000000010";
    const sourceId = "00000000-0000-4000-8000-000000000011";
    const position = imported({ totalValue: "100.00" });
    const key = getEmergencyReserveAssetKey(position);
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({
      objectives: [
        { ...customObjective, id: targetId },
        { ...customObjective, id: sourceId, name: "Casa" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: key }],
    });
    const service = new PortfolioObjectivesService();

    await expect(
      service.updateAssignments(targetId, { assetKeys: [key] }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.replaceAssignmentsWithTransfers).not.toHaveBeenCalled();

    await expect(
      service.updateAssignments(targetId, {
        assetKeys: [key],
        transfers: [
          {
            assetKey: key,
            fromObjectiveId: sourceId,
            toObjectiveId: targetId,
          },
        ],
      }),
    ).resolves.toBeUndefined();
    expect(mocks.replaceAssignmentsWithTransfers).toHaveBeenCalledWith(
      targetId,
      [key],
      [
        {
          assetKey: key,
          fromObjectiveId: sourceId,
          toObjectiveId: targetId,
        },
      ],
    );
  });

  it("returns readable feedback for an invalid valuation date", async () => {
    await expect(
      new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        valuationDate: "not-a-date",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Informe um valor válido para comparar.",
    });
  });

  it("retains a partial objective baseline beside an exact transfer candidate", async () => {
    const free = Array.from({ length: 37 }, (_, index) =>
      imported({
        assetCode: `PARTIAL-${index}`,
        totalValue: "700",
        canonicalValueCents: "70000",
      }),
    );
    const assigned = imported({
      assetCode: "TRANSFER-EXACT",
      totalValue: "1000",
      canonicalValueCents: "100000",
    });
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    const sourceId = "objective-partial-source";
    mocks.listCurrentEnriched.mockResolvedValue([...free, assigned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Viagem" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: assignedKey }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        objectiveId: customObjective.id,
        targetAmount: 1000,
        instrumentType: "ALL",
      });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      searchLimited: true,
      candidates: expect.arrayContaining([
        expect.objectContaining({ assetKeys: [assignedKey], difference: 0 }),
        expect.objectContaining({ difference: 300 }),
      ]),
    });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.candidates.some((candidate) => !candidate.transfers)).toBe(
      true,
    );
  });

  it("prefers an observed no-transfer objective candidate on a partial tie", async () => {
    const free = Array.from({ length: 37 }, (_, index) =>
      imported({
        assetCode: `TIE-PARTIAL-${index}`,
        totalValue: "700",
        canonicalValueCents: "70000",
      }),
    );
    const assigned = imported({
      assetCode: "TIE-TRANSFER",
      totalValue: "1300",
      canonicalValueCents: "130000",
    });
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    const sourceId = "objective-partial-tie-source";
    mocks.listCurrentEnriched.mockResolvedValue([...free, assigned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Viagem" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: assignedKey }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        objectiveId: customObjective.id,
        targetAmount: 1000,
        instrumentType: "ALL",
      });

    expect(result).toMatchObject({
      status: "suggestions",
      searchLimited: true,
      candidates: expect.arrayContaining([
        expect.objectContaining({ difference: 300 }),
        expect.objectContaining({
          difference: -300,
          transfers: expect.any(Array),
        }),
      ]),
    });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.candidates[0].difference).toBe(300);
    expect(result.candidates[0].transfers).toBeUndefined();
  });

  it("returns readable feedback when a transfer source no longer owns the position", async () => {
    const targetId = "00000000-0000-4000-8000-000000000011";
    const sourceId = "00000000-0000-4000-8000-000000000012";
    const position = imported({ totalValue: "100.00" });
    const key = getEmergencyReserveAssetKey(position);
    mocks.getObjective.mockResolvedValue({ ...customObjective, id: targetId });
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({ objectives: [], assignments: [] });
    mocks.classifyPositions.mockResolvedValue([
      { ...position, assetKey: key, objectiveId: null, objectiveName: null },
    ]);

    await expect(
      new PortfolioObjectivesService().updateAssignments(targetId, {
        assetKeys: [key],
        transfers: [
          {
            assetKey: key,
            fromObjectiveId: sourceId,
            toObjectiveId: targetId,
          },
        ],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "Uma posição mudou de destino desde a busca. Atualize os objetivos e tente novamente.",
    });
    expect(mocks.replaceAssignmentsWithTransfers).not.toHaveBeenCalled();
  });

  it.each([
    {
      assetKeys: ["asset-a"],
      transfers: [
        {
          assetKey: "asset-a",
          fromObjectiveId: "00000000-0000-4000-8000-000000000021",
          toObjectiveId: "00000000-0000-4000-8000-000000000020",
        },
        {
          assetKey: "asset-a",
          fromObjectiveId: "00000000-0000-4000-8000-000000000021",
          toObjectiveId: "00000000-0000-4000-8000-000000000020",
        },
      ],
    },
    {
      assetKeys: ["asset-a"],
      transfers: [
        {
          assetKey: "asset-b",
          fromObjectiveId: "00000000-0000-4000-8000-000000000021",
          toObjectiveId: "00000000-0000-4000-8000-000000000020",
        },
      ],
    },
    {
      assetKeys: ["asset-a"],
      transfers: [
        {
          assetKey: "asset-a",
          fromObjectiveId: "00000000-0000-4000-8000-000000000021",
          toObjectiveId: "00000000-0000-4000-8000-000000000022",
        },
      ],
    },
  ])(
    "rejects duplicate, unselected, or misdirected transfer confirmations",
    async (body) => {
      await expect(
        new PortfolioObjectivesService().updateAssignments(
          "00000000-0000-4000-8000-000000000020",
          body,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mocks.listCurrentEnriched).not.toHaveBeenCalled();
      expect(mocks.replaceAssignmentsWithTransfers).not.toHaveBeenCalled();
    },
  );

  it("reports candidate transfer impacts for known and orphaned source objectives", async () => {
    const targetId = customObjective.id;
    const homeId = "objective-home";
    const free = imported({
      assetCode: "FREE-20",
      totalValue: "20.00",
      canonicalValueCents: "2000",
    });
    const homeTransfer = imported({
      assetCode: "HOME-70",
      totalValue: "70.00",
      canonicalValueCents: "7000",
    });
    const homeRemaining = imported({
      assetCode: "HOME-5",
      totalValue: "5.00",
      canonicalValueCents: "500",
    });
    const orphanTransfer = imported({
      assetCode: "ORPHAN-10",
      totalValue: "10.00",
      canonicalValueCents: "1000",
      referenceDate: null,
    });
    const freeKey = getEmergencyReserveAssetKey(free);
    const homeTransferKey = getEmergencyReserveAssetKey(homeTransfer);
    const homeRemainingKey = getEmergencyReserveAssetKey(homeRemaining);
    const orphanTransferKey = getEmergencyReserveAssetKey(orphanTransfer);
    mocks.listCurrentEnriched.mockResolvedValue([
      free,
      homeTransfer,
      homeRemaining,
      orphanTransfer,
    ]);
    mocks.list.mockResolvedValue({
      objectives: [
        { ...customObjective, targetAmount: null },
        { ...customObjective, id: homeId, name: "Casa", targetAmount: null },
      ],
      assignments: [
        { objectiveId: homeId, assetKey: homeTransferKey },
        { objectiveId: homeId, assetKey: homeRemainingKey },
        {
          objectiveId: homeId,
          assetKey: getEmergencyReserveAssetKey(
            imported({
              assetCode: "HOME-UNVALUED",
              totalValue: null,
              issuer: "Banco C S.A.",
              institution: "Banco C",
            }),
          ),
        },
        { objectiveId: "deleted-objective", assetKey: orphanTransferKey },
      ],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        objectiveId: targetId,
        valuationDate: "2026-09-30",
      });

    expect(mocks.listCurrentEnriched).toHaveBeenCalledWith(
      undefined,
      "2026-09-30",
    );
    expect(result).toMatchObject({ status: "suggestions", kind: "exact" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    const transferCandidate = result.candidates.find((candidate) =>
      candidate.assetKeys.includes(orphanTransferKey),
    );
    expect(transferCandidate?.assetKeys).toEqual(
      expect.arrayContaining([freeKey, homeTransferKey, orphanTransferKey]),
    );
    expect(transferCandidate?.transfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetKey: homeTransferKey,
          fromObjectiveName: "Casa",
          toObjectiveId: targetId,
          value: 70,
        }),
        expect.objectContaining({
          assetKey: orphanTransferKey,
          fromObjectiveName: "Outro objetivo",
          toObjectiveId: targetId,
          value: 10,
        }),
      ]),
    );
    expect(transferCandidate?.positions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetKey: orphanTransferKey,
          referenceDate: null,
        }),
      ]),
    );
    expect(transferCandidate?.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectiveId: targetId,
          currentValue: 100,
          transferredValue: 80,
          targetAmount: null,
          progressPercent: null,
        }),
        expect.objectContaining({
          objectiveId: homeId,
          objectiveName: "Casa",
          currentValue: null,
          knownValue: 5,
          targetAmount: null,
          progressPercent: null,
        }),
        expect.objectContaining({
          objectiveId: "deleted-objective",
          objectiveName: "Outro objetivo",
          currentValue: null,
          knownValue: 0,
          progressPercent: null,
        }),
      ]),
    );
  });

  it("uses the CDB-only expanded pool to find an exact candidate requiring transfer", async () => {
    const targetId = customObjective.id;
    const sourceId = "objective-home-cdb";
    const free = imported({ assetCode: "FREE-CDB-20", totalValue: "20.00" });
    const owned = imported({
      assetCode: "OWNED-CDB-30",
      totalValue: "30.00",
      institution: "Banco B",
      issuer: "Banco B S.A.",
    });
    const freeKey = getEmergencyReserveAssetKey(free);
    const ownedKey = getEmergencyReserveAssetKey(owned);
    mocks.listCurrentEnriched.mockResolvedValue([free, owned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Casa" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: ownedKey }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 55,
        objectiveId: targetId,
        instrumentType: "CDB",
      });

    expect(result).toMatchObject({ status: "suggestions", kind: "nearest" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.candidates[0].assetKeys).toEqual(
      expect.arrayContaining([freeKey, ownedKey]),
    );
    expect(result.candidates[0].transfers).toEqual([
      expect.objectContaining({
        assetKey: ownedKey,
        fromObjectiveId: sourceId,
      }),
    ]);
  });

  it("keeps the baseline when an expanded transfer candidate is not closer", async () => {
    const targetId = customObjective.id;
    const sourceId = "objective-home-not-closer";
    const free = imported({ assetCode: "FREE-90", totalValue: "90.00" });
    const owned = imported({
      assetCode: "OWNED-90",
      totalValue: "90.00",
      institution: "Banco B",
      issuer: "Banco B S.A.",
    });
    const freeKey = getEmergencyReserveAssetKey(free);
    const ownedKey = getEmergencyReserveAssetKey(owned);
    mocks.listCurrentEnriched.mockResolvedValue([free, owned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Casa" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: ownedKey }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        objectiveId: targetId,
      });

    expect(result).toMatchObject({ status: "suggestions", kind: "nearest" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.candidates[0].assetKeys).toContain(freeKey);
    expect(result.candidates[0].assetKeys).not.toContain(ownedKey);
    expect(result.candidates[0].transfers).toBeUndefined();
  });

  it("retains the no-valued-positions result when an expanded pool has no candidates", async () => {
    const targetId = customObjective.id;
    const sourceId = "objective-home-unvalued";
    const unvalued = imported({
      assetCode: "OWNED-UNVALUED",
      totalValue: "not available",
      canonicalValueCents: null,
    });
    const key = getEmergencyReserveAssetKey(unvalued);
    mocks.listCurrentEnriched.mockResolvedValue([unvalued]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Casa" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: key }],
    });

    await expect(
      new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        objectiveId: targetId,
      }),
    ).resolves.toMatchObject({ status: "no_valued_positions" });
  });

  it("uses a source-only candidate when no free baseline exists", async () => {
    const targetId = customObjective.id;
    const sourceId = "objective-home-source-only";
    const owned = imported({ assetCode: "OWNED-ONLY", totalValue: "80.00" });
    const key = getEmergencyReserveAssetKey(owned);
    mocks.listCurrentEnriched.mockResolvedValue([owned]);
    mocks.list.mockResolvedValue({
      objectives: [
        customObjective,
        { ...customObjective, id: sourceId, name: "Casa" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: key }],
    });

    const result =
      await new PortfolioObjectivesService().findPositionCombinations({
        targetAmount: 100,
        objectiveId: targetId,
      });

    expect(result).toMatchObject({ status: "suggestions", kind: "nearest" });
    if (result.status !== "suggestions") throw new Error("Expected candidates");
    expect(result.candidates[0].assetKeys).toContain(key);
    expect(result.candidates[0].transfers).toEqual([
      expect.objectContaining({ assetKey: key, fromObjectiveId: sourceId }),
    ]);
  });

  it("optimizes only entered balances and preserves owners of omitted objectives", async () => {
    const measuredId = "00000000-0000-4000-8000-000000000001";
    const omittedId = "00000000-0000-4000-8000-000000000002";
    const measured = { ...customObjective, id: measuredId, name: "Reserva" };
    const omitted = { ...customObjective, id: omittedId, name: "Viagem" };
    const freePosition = imported({
      assetCode: "FREE",
      totalValue: "100.00",
      canonicalValueCents: "10000",
    });
    const ownedPosition = imported({
      assetCode: "OWNED",
      totalValue: "90.00",
      canonicalValueCents: "9000",
    });
    const freeKey = getEmergencyReserveAssetKey(freePosition);
    const ownedKey = getEmergencyReserveAssetKey(ownedPosition);
    mocks.listCurrentEnriched.mockResolvedValue([freePosition, ownedPosition]);
    mocks.list.mockResolvedValue({
      objectives: [measured, omitted],
      assignments: [{ objectiveId: omittedId, assetKey: ownedKey }],
    });

    const result =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId: measuredId, amount: 100 }],
      });

    expect(result.optimal).toBe(true);
    expect(result.allocation).toEqual({ [freeKey]: measuredId });
    expect(result.preservedPositionCount).toBe(1);
    expect(result.expectedValueCents).toEqual({ [freeKey]: "10000" });
    expect(result.expectedValuationDates).toEqual({
      [freeKey]: "2026-09-30",
    });
    expect(result.objectives[0]).toMatchObject({
      name: "Reserva",
      observedBalanceCents: "10000",
      proposedValueCents: "10000",
      differenceCents: "0",
    });
  });

  it("confirms only the server-recomputed complete allocation and stores its references", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000003";
    const position = imported({
      assetCode: "CONFIRM",
      totalValue: "25.00",
      canonicalValueCents: "2500",
    });
    const additionalPosition = imported({
      assetCode: "CONFIRM-ADDITIONAL",
      totalValue: "5.00",
      canonicalValueCents: "500",
    });
    const assetKey = getEmergencyReserveAssetKey(position);
    const additionalAssetKey = getEmergencyReserveAssetKey(additionalPosition);
    mocks.listCurrentEnriched.mockResolvedValue([position, additionalPosition]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId, name: "Reserva" }],
      assignments: [],
    });
    mocks.saveGlobalAllocation.mockResolvedValue({ batchId: "batch-1" });
    const preview =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 25 }],
      });

    await expect(
      new PortfolioObjectivesService().confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 25 }],
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: Object.fromEntries(
          Object.entries(preview.expectedValueCents).reverse(),
        ),
        expectedValuationDates: Object.fromEntries(
          Object.entries(preview.expectedValuationDates).reverse(),
        ),
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).resolves.toEqual({ batchId: "batch-1" });
    expect(mocks.saveGlobalAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        observedOn: "2026-10-01",
        allocation: { [assetKey]: objectiveId, [additionalAssetKey]: null },
        references: [{ objectiveId, amountCents: "2500" }],
      }),
    );
  });

  it("rejects a stale or changed allocation before persistence", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000004";
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const service = new PortfolioObjectivesService();
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 1 }],
    });
    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 1 }],
        allocation: { forged: objectiveId },
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("rejects confirmation when an eligible position's canonical cents change", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000013";
    const position = imported({
      assetCode: "CHANGING-VALUE",
      canonicalValueCents: "2500",
    });
    const changedPosition = { ...position, canonicalValueCents: "2501" };
    mocks.listCurrentEnriched
      .mockResolvedValueOnce([position])
      .mockResolvedValueOnce([changedPosition])
      .mockResolvedValueOnce([changedPosition]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const service = new PortfolioObjectivesService();
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 25 }],
    });
    const changedPreview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 25 }],
    });
    expect(changedPreview.allocation).toEqual(preview.allocation);
    expect(changedPreview.expectedValueCents).not.toEqual(
      preview.expectedValueCents,
    );

    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 25 }],
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("rejects confirmation when an eligible position's effective date changes", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000014";
    const position = imported({
      assetCode: "CHANGING-DATE",
      canonicalValueCents: "2500",
      referenceDate: "2026-09-29",
    });
    const changedPosition = { ...position, referenceDate: "2026-09-30" };
    mocks.listCurrentEnriched
      .mockResolvedValueOnce([position])
      .mockResolvedValueOnce([changedPosition]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const service = new PortfolioObjectivesService();
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 25 }],
    });

    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 25 }],
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("rejects a changed position identity even when its cents and allocation stay the same", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000024";
    const position = imported({
      id: "position-identity",
      assetKey: "stable-asset-key",
      assetCode: "CDB-OLD",
      canonicalValueCents: "2500",
    });
    const changedPosition = { ...position, assetCode: "CDB-NEW" };
    mocks.listCurrentEnriched
      .mockResolvedValueOnce([position])
      .mockResolvedValueOnce([changedPosition]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const service = new PortfolioObjectivesService();
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 25 }],
    });

    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 25 }],
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("rejects a malformed confirmation payload", async () => {
    await expect(
      new PortfolioObjectivesService().confirmGlobalAllocation({}),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("validates balances and protects duplicate or deleted destinations", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000005";
    const service = new PortfolioObjectivesService();
    await expect(service.previewGlobalAllocation({})).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [
          { objectiveId, amount: 1 },
          { objectiveId, amount: 2 },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    mocks.list.mockResolvedValue({ objectives: [], assignments: [] });
    await expect(
      service.previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 1 }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("reports candidate transfers, effective dates, limitations, and unvalued positions", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000006";
    const targetId = "00000000-0000-4000-8000-000000000007";
    const omittedId = "00000000-0000-4000-8000-000000000012";
    const source = { ...customObjective, id: sourceId, name: "Viagem" };
    const target = { ...customObjective, id: targetId, name: "Reserva" };
    const omitted = { ...customObjective, id: omittedId, name: "Casa" };
    const transferPosition = imported({
      assetCode: "TRANSFER-ME",
      totalValue: "1.00",
      canonicalValueCents: "100",
      estimatedThrough: "2026-09-30",
      cdbEstimateLimitation: "Taxas disponíveis até 30/09.",
    });
    const unvalued = imported({
      assetCode: "UNVALUED",
      canonicalValueCents: null,
      cdbEstimateLimitation: "Data-base CURVA nao confirmada.",
    });
    const omittedValued = imported({
      assetCode: "OMITTED-VALUED",
      canonicalValueCents: "250",
    });
    const omittedUnvalued = imported({
      assetCode: "OMITTED-UNVALUED",
      canonicalValueCents: null,
    });
    const freeUnvalued = imported({
      assetCode: "FREE-UNVALUED",
      canonicalValueCents: null,
    });
    const transferKey = getEmergencyReserveAssetKey(transferPosition);
    const unvaluedKey = getEmergencyReserveAssetKey(unvalued);
    const omittedValuedKey = getEmergencyReserveAssetKey(omittedValued);
    const omittedUnvaluedKey = getEmergencyReserveAssetKey(omittedUnvalued);
    const freeUnvaluedKey = getEmergencyReserveAssetKey(freeUnvalued);
    mocks.listCurrentEnriched.mockResolvedValue([
      transferPosition,
      unvalued,
      omittedValued,
      omittedUnvalued,
      freeUnvalued,
    ]);
    mocks.list.mockResolvedValue({
      objectives: [source, target, omitted],
      assignments: [
        { objectiveId: sourceId, assetKey: transferKey },
        { objectiveId: targetId, assetKey: unvaluedKey },
        { objectiveId: omittedId, assetKey: omittedValuedKey },
        { objectiveId: omittedId, assetKey: omittedUnvaluedKey },
      ],
    });

    const result =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [
          { objectiveId: sourceId, amount: 0 },
          { objectiveId: targetId, amount: 1 },
        ],
      });

    expect(result.transfers).toEqual([
      expect.objectContaining({
        assetKey: transferKey,
        product: transferPosition.product,
        assetCode: transferPosition.assetCode,
        maturityAt: transferPosition.maturityAt,
        fromObjectiveId: sourceId,
        fromObjectiveName: "Viagem",
        toObjectiveId: targetId,
        toObjectiveName: "Reserva",
      }),
    ]);
    expect(result.effectiveValuationDates).toEqual(["2026-09-30"]);
    expect(result.limitations).toEqual(["Taxas disponíveis até 30/09."]);
    expect(result.preservedPositionCount).toBe(4);
    expect(result.preservedPositions).toEqual([
      {
        assetKey: unvaluedKey,
        product: unvalued.product,
        ownerObjectiveId: targetId,
        ownerObjectiveName: "Reserva",
        valueCents: null,
        reasons: [
          {
            code: "value_unavailable",
            limitation: "Data-base CURVA nao confirmada.",
          },
        ],
      },
      {
        assetKey: omittedValuedKey,
        product: omittedValued.product,
        ownerObjectiveId: omittedId,
        ownerObjectiveName: "Casa",
        valueCents: "250",
        reasons: [{ code: "objective_balance_not_provided" }],
      },
      {
        assetKey: omittedUnvaluedKey,
        product: omittedUnvalued.product,
        ownerObjectiveId: omittedId,
        ownerObjectiveName: "Casa",
        valueCents: null,
        reasons: [
          {
            code: "value_unavailable",
            limitation: null,
          },
          { code: "objective_balance_not_provided" },
        ],
      },
      {
        assetKey: freeUnvaluedKey,
        product: freeUnvalued.product,
        ownerObjectiveId: null,
        ownerObjectiveName: null,
        valueCents: null,
        reasons: [
          {
            code: "value_unavailable",
            limitation: null,
          },
        ],
      },
    ]);
  });

  it("requires explicit consent before a partial search can be confirmed", async () => {
    const firstId = "00000000-0000-4000-8000-000000000008";
    const secondId = "00000000-0000-4000-8000-000000000009";
    const position = imported({
      assetCode: "LIMITED",
      canonicalValueCents: "100",
    });
    const key = getEmergencyReserveAssetKey(position);
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({
      objectives: [
        { ...customObjective, id: firstId },
        { ...customObjective, id: secondId },
      ],
      assignments: [],
    });
    const service = new PortfolioObjectivesService(1);
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [
        { objectiveId: firstId, amount: 1 },
        { objectiveId: secondId, amount: 2 },
      ],
    });
    expect(preview).toMatchObject({
      optimal: false,
      canConfirm: true,
      stateLimit: 1,
    });
    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [
          { objectiveId: firstId, amount: 1 },
          { objectiveId: secondId, amount: 2 },
        ],
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
    expect(preview.expectedOwners).toEqual({ [key]: null });
  });

  it("keeps transfer maturity unknown when grouped manual positions disagree", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000018";
    const targetId = "00000000-0000-4000-8000-000000000019";
    const first = imported({
      source: "MANUAL",
      assetKey: "manual-shared-key",
      assetCode: "MANUAL-1",
      canonicalValueCents: "50",
      maturityAt: null,
    });
    const second = imported({
      source: "MANUAL",
      assetKey: "manual-shared-key",
      assetCode: "MANUAL-1",
      canonicalValueCents: "50",
      maturityAt: "2028-01-01",
    });
    const third = imported({
      source: "MANUAL",
      assetKey: "manual-shared-key",
      assetCode: "MANUAL-1",
      canonicalValueCents: "50",
      maturityAt: null,
    });
    mocks.listCurrentEnriched.mockResolvedValue([first, second, third]);
    mocks.list.mockResolvedValue({
      objectives: [
        { ...customObjective, id: sourceId, name: "Origem" },
        { ...customObjective, id: targetId, name: "Destino" },
      ],
      assignments: [{ objectiveId: sourceId, assetKey: "manual-shared-key" }],
    });

    const result =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [
          { objectiveId: sourceId, amount: 0 },
          { objectiveId: targetId, amount: 1.5 },
        ],
      });

    expect(result.transfers).toEqual([
      expect.objectContaining({
        assetKey: "manual-shared-key",
        product: first.product,
        assetCode: first.assetCode,
        maturityAt: null,
        fromObjectiveName: "Origem",
        toObjectiveName: "Destino",
      }),
    ]);
  });

  it("confirms a partial candidate only when the request explicitly accepts it", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000016";
    const position = imported({
      assetCode: "PARTIAL-CONSENT",
      canonicalValueCents: "100",
    });
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    mocks.saveGlobalAllocation.mockResolvedValue({ batchId: "partial-batch" });
    const service = new PortfolioObjectivesService(1);
    const request = {
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 1 }],
    };
    const preview = await service.previewGlobalAllocation(request);
    expect(preview.optimal).toBe(false);

    await expect(
      service.confirmGlobalAllocation({
        ...request,
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
        acceptPartial: true,
      }),
    ).resolves.toEqual({ batchId: "partial-batch" });
    expect(mocks.saveGlobalAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ allocation: preview.allocation }),
    );
  });

  it("still rejects a stale partial candidate after explicit consent", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000017";
    const position = imported({
      assetCode: "STALE-PARTIAL",
      canonicalValueCents: "100",
    });
    const changedPosition = { ...position, canonicalValueCents: "101" };
    mocks.listCurrentEnriched
      .mockResolvedValueOnce([position])
      .mockResolvedValueOnce([changedPosition]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const service = new PortfolioObjectivesService(1);
    const request = {
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 1 }],
    };
    const preview = await service.previewGlobalAllocation(request);
    expect(preview.optimal).toBe(false);
    await expect(
      service.confirmGlobalAllocation({
        ...request,
        allocation: preview.allocation,
        expectedOwners: preview.expectedOwners,
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
        acceptPartial: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveGlobalAllocation).not.toHaveBeenCalled();
  });

  it("rejects confirmation when the expected owner map is stale even if allocation is unchanged", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000010";
    const service = new PortfolioObjectivesService();
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const preview = await service.previewGlobalAllocation({
      valuationDate: "2026-10-01",
      balances: [{ objectiveId, amount: 0 }],
    });
    await expect(
      service.confirmGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 0 }],
        allocation: preview.allocation,
        expectedOwners: { stale: null },
        expectedValueCents: preview.expectedValueCents,
        expectedValuationDates: preview.expectedValuationDates,
        expectedSourceFingerprint: preview.expectedSourceFingerprint,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("leaves positions whose values exceed a small measured balance unassigned", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000011";
    const position = imported({
      assetCode: "TOO-LARGE",
      canonicalValueCents: "10000",
      referenceDate: null,
    });
    const key = getEmergencyReserveAssetKey(position);
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [],
    });
    const result =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 10 }],
      });
    expect(result.unassignedPositions).toEqual([
      { assetKey: key, product: position.product, valueCents: "10000" },
    ]);
    expect(result.effectiveValuationDates).toEqual([]);
  });

  it("identifies owned positions that the proposed allocation will leave without an objective", async () => {
    const objectiveId = "00000000-0000-4000-8000-000000000018";
    const position = imported({
      assetCode: "UNASSIGN-OWNED",
      canonicalValueCents: "10000",
      maturityAt: null,
    });
    const key = getEmergencyReserveAssetKey(position);
    mocks.listCurrentEnriched.mockResolvedValue([position]);
    mocks.list.mockResolvedValue({
      objectives: [{ ...customObjective, id: objectiveId }],
      assignments: [{ objectiveId, assetKey: key }],
    });

    const result =
      await new PortfolioObjectivesService().previewGlobalAllocation({
        valuationDate: "2026-10-01",
        balances: [{ objectiveId, amount: 0 }],
      });

    expect(result.allocation[key]).toBeNull();
    expect(result.unassignmentTransfers).toEqual([
      {
        assetKey: key,
        product: position.product,
        assetCode: position.assetCode,
        maturityAt: null,
        fromObjectiveId: objectiveId,
        fromObjectiveName: customObjective.name,
        valueCents: "10000",
      },
    ]);
  });
});
