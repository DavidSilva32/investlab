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
  portfolioObjectivesRepository: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
    getObjective: mocks.getObjective,
    replaceAssignments: mocks.replaceAssignments,
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
    mocks.getObjective.mockResolvedValue(customObjective);
    mocks.create.mockResolvedValue(customObjective);
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
    ).resolves.toEqual({ status: "no_valued_positions" });

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
    expect(mocks.replaceAssignments).toHaveBeenCalledWith("objective-trip", [
      key,
    ]);
  });
});
