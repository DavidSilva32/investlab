import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLatestPositions: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  enrich: vi.fn(),
  classifyPositions: vi.fn(),
  listObjectives: vi.fn(),
  replaceReserveAssignments: vi.fn(),
  getObjectivesOverview: vi.fn(),
}));

vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: mocks.listLatestPositions },
}));
vi.mock("@/backend/repositories/emergency-reserve.repository", () => ({
  emergencyReserveRepository: {
    getSettings: mocks.getSettings,
    saveSettings: mocks.saveSettings,
  },
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: {
    list: mocks.listObjectives,
    listReserveAssignments: vi.fn().mockResolvedValue([]),
    replaceReserveAssignments: mocks.replaceReserveAssignments,
  },
}));
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: { enrich: mocks.enrich },
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: { classifyPositions: mocks.classifyPositions },
}));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: { getOverview: mocks.getObjectivesOverview },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { inferPortfolioAssetClassification } from "@/backend/services/portfolio-classification";
import { EmergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";

const position = (overrides: Record<string, unknown> = {}) => ({
  id: "snapshot-row-1",
  snapshotId: "snapshot-1",
  product: "CDB DI",
  institution: "Banco A",
  issuer: "Banco A S.A.",
  assetCode: "CDB123",
  indexer: "DI",
  regimeType: "PÓS-FIXADO",
  issuedAt: "2025-01-01",
  maturityAt: "2028-01-01",
  quantity: "1",
  availableQuantity: null,
  unavailableQuantity: null,
  unitPrice: "100",
  totalValue: "100",
  valuationSource: "imported",
  mtmUnitPrice: null,
  mtmTotalValue: null,
  curveUnitPrice: null,
  curveTotalValue: null,
  closingUnitPrice: null,
  closingTotalValue: null,
  source: "B3",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  referenceDate: "2026-09-01",
  ...overrides,
});

describe("EmergencyReserveService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLatestPositions.mockResolvedValue([]);
    mocks.enrich.mockImplementation(async (positions) => positions);
    mocks.classifyPositions.mockImplementation(
      async (
        positions: Array<{
          product: string;
          assetCode: string | null;
          issuer: string | null;
          institution: string | null;
          indexer: string | null;
          regimeType: string | null;
        }>,
      ) =>
        positions.map(
          (item: {
            product: string;
            assetCode: string | null;
            issuer: string | null;
            institution: string | null;
            indexer: string | null;
            regimeType: string | null;
          }) => ({
            ...item,
            classification: inferPortfolioAssetClassification(item),
          }),
        ),
    );
    mocks.getSettings.mockResolvedValue(null);
    mocks.saveSettings.mockResolvedValue(undefined);
    mocks.listObjectives.mockResolvedValue({ objectives: [], assignments: [] });
    mocks.replaceReserveAssignments.mockResolvedValue(undefined);
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [],
      positions: [],
    });
  });

  it("previews selected holdings from canonical integer cents", async () => {
    const service = new EmergencyReserveService();
    vi.spyOn(service, "getEditorData").mockResolvedValue({
      holdings: [
        { assetKey: `v1:${"a".repeat(64)}`, valueCents: "12550" },
        { assetKey: `v1:${"b".repeat(64)}`, valueCents: null },
        { assetKey: `v1:${"c".repeat(64)}`, valueCents: "99900" },
      ],
      calculation: { referenceDate: "2026-09-30" },
    } as never);

    await expect(
      service.preview(
        {
          monthlyExpenses: 1000,
          targetMonths: 3,
          selectedAssetKeys: [`v1:${"a".repeat(64)}`, `v1:${"b".repeat(64)}`],
        },
        "preview-1",
      ),
    ).resolves.toMatchObject({
      selectedValueCents: "12550",
      selectedGroups: 2,
      unvaluedGroups: 1,
      targetValueCents: "300000",
    });
  });

  it("rejects invalid reserve preview input", async () => {
    await expect(
      new EmergencyReserveService().preview({ monthlyExpenses: -1 }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("returns an empty contribution context when reserve settings do not exist", async () => {
    mocks.getSettings.mockResolvedValue(null);
    const result = await new EmergencyReserveService().getContributionContext(
      [],
    );

    expect(result.selectedAssetKeys).toEqual([]);
    expect(result.calculation.status).toBe("not_configured");
    expect(result.calculation.missingSelectionCount).toBe(0);
  });

  it("preserves configured reserve settings for the aporte calculation", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "2500.00",
      targetMonths: 6,
      selectedAssetKeys: [assetKey],
    });
    const result = await new EmergencyReserveService().getContributionContext([
      {
        ...cdb,
        estimatedValue: 100,
        classification: { assetClass: "Renda fixa" },
      },
    ]);

    expect(result.selectedAssetKeys).toEqual([assetKey]);
    expect(result.calculation).toMatchObject({
      monthlyExpenses: 2500,
      targetMonths: 6,
      selectedValue: 100,
      selectedGroups: 1,
    });
  });

  it("keeps a group key stable when quantities and values change", () => {
    const first = position();
    const nextSnapshot = position({
      id: "snapshot-row-2",
      snapshotId: "snapshot-2",
      quantity: "3",
      totalValue: "325",
    });

    expect(getEmergencyReserveAssetKey(first)).toBe(
      getEmergencyReserveAssetKey(nextSnapshot),
    );
  });

  it("tolerates missing descriptive values in the stable key", () => {
    expect(getEmergencyReserveAssetKey(position({ assetCode: null }))).toMatch(
      /^v1:[a-f0-9]{64}$/u,
    );
  });

  it("does not silently reattach a selection after descriptive attributes change", async () => {
    const previousIdentity = position();
    const updatedLabel = position({ product: "CDB pós-fixado DI" });
    mocks.listLatestPositions.mockResolvedValue([updatedLabel]);
    mocks.enrich.mockResolvedValue([updatedLabel]);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "100",
      targetMonths: 3,
      selectedAssetKeys: [getEmergencyReserveAssetKey(previousIdentity)],
    });

    const data = await new EmergencyReserveService().getEditorData();

    expect(data.holdings[0].selected).toBe(false);
    expect(data.missingSelectionCount).toBe(1);
    expect(data.calculation.selectedValue).toBe(0);
  });
  it("separates holdings with otherwise equal descriptions at different institutions", () => {
    expect(getEmergencyReserveAssetKey(position())).not.toBe(
      getEmergencyReserveAssetKey(position({ institution: "Banco B" })),
    );
  });

  it("groups indistinguishable positions and counts only selected known values", async () => {
    const first = position({ totalValue: "100", estimatedValue: 125 });
    const duplicate = position({
      id: "snapshot-row-2",
      totalValue: "50",
      estimatedValue: null,
    });
    const unvaluedDuplicate = position({
      id: "snapshot-row-4",
      totalValue: null,
      estimatedValue: null,
    });
    const withoutValue = position({
      id: "snapshot-row-3",
      assetCode: "CDB456",
      totalValue: null,
      estimatedValue: null,
    });
    mocks.listLatestPositions.mockResolvedValue([
      first,
      duplicate,
      unvaluedDuplicate,
      withoutValue,
    ]);
    mocks.enrich.mockResolvedValue([
      first,
      duplicate,
      unvaluedDuplicate,
      withoutValue,
    ]);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "100",
      targetMonths: 3,
      selectedAssetKeys: [getEmergencyReserveAssetKey(first)],
    });

    const data = await new EmergencyReserveService().getEditorData("request-1");

    expect(data.holdings).toHaveLength(2);
    expect(data.holdings[0]).toMatchObject({
      positionCount: 3,
      value: 175,
      unvaluedPositions: 1,
      selected: true,
    });
    expect(data.calculation).toMatchObject({
      selectedValue: 175,
      coveredMonths: 1.75,
      targetValue: 300,
      selectedGroups: 1,
      status: "below_target",
    });
    expect(data.selectedPositionCount).toBe(3);
    expect(data.missingSelectionCount).toBe(0);
  });

  it("shows the objective assignment owner for matching reserve holdings", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    mocks.enrich.mockResolvedValue([cdb]);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "100",
      targetMonths: 2,
      selectedAssetKeys: [assetKey],
    });
    mocks.listObjectives.mockResolvedValue({
      objectives: [
        { id: "00000000-0000-4000-8000-000000000010", name: "Reserva" },
      ],
      assignments: [
        { objectiveId: "00000000-0000-4000-8000-000000000010", assetKey },
        { objectiveId: "legacy-goal", assetKey: "v1:orphaned" },
      ],
    });

    const result = await new EmergencyReserveService().getEditorData();

    expect(result.holdings[0]).toMatchObject({
      selected: true,
      assignedObjectiveId: "00000000-0000-4000-8000-000000000010",
      assignedObjectiveName: "Reserva",
    });
  });

  it("retains selections that are absent from the latest snapshot without counting them", async () => {
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "50",
      targetMonths: 2,
      selectedAssetKeys: [`v1:${"a".repeat(64)}`],
    });

    const data = await new EmergencyReserveService().getEditorData();

    expect(data.selectedAssetKeys).toEqual([`v1:${"a".repeat(64)}`]);
    expect(data.missingSelectionCount).toBe(1);
    expect(data.calculation.selectedValue).toBe(0);
  });

  it("returns an unconfigured summary when there is no saved goal", async () => {
    const calculation = await new EmergencyReserveService().getSummary(
      [],
      "r4",
    );

    expect(calculation).toMatchObject({
      monthlyExpenses: null,
      targetMonths: null,
      selectedValue: 0,
      referenceDate: null,
      status: "not_configured",
    });
  });

  it("excludes selected positions without a finite valuation and reports them", async () => {
    const valued = position({
      estimatedValue: null,
      totalValue: "150",
      classification: { assetClass: "Renda fixa" },
    });
    const noValue = position({
      assetCode: "CDB999",
      estimatedValue: null,
      totalValue: "not-a-number",
      classification: { assetClass: "Renda fixa" },
    });
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "100",
      targetMonths: 2,
      selectedAssetKeys: [
        getEmergencyReserveAssetKey(valued),
        getEmergencyReserveAssetKey(noValue),
      ],
    });

    const calculation = await new EmergencyReserveService().getSummary([
      { ...valued, classification: { assetClass: "Renda fixa" } },
      { ...noValue, classification: { assetClass: "Renda fixa" } },
    ]);

    expect(calculation).toMatchObject({
      selectedValue: 150,
      selectedGroups: 2,
      unvaluedGroups: 1,
      status: "below_target",
    });
  });
  it("rejects invalid configuration without writing it", async () => {
    await expect(
      new EmergencyReserveService().saveSettings(
        { monthlyExpenses: 0, targetMonths: 6, selectedAssetKeys: [] },
        "request-2",
      ),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it.each([
    {
      selectedAssetKeys: [`v1:${"a".repeat(64)}`],
      transfers: [
        {
          assetKey: `v1:${"a".repeat(64)}`,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000010",
        },
        {
          assetKey: `v1:${"a".repeat(64)}`,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000010",
        },
      ],
    },
    {
      selectedAssetKeys: [`v1:${"a".repeat(64)}`],
      transfers: [
        {
          assetKey: `v1:${"b".repeat(64)}`,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000010",
        },
      ],
    },
    {
      selectedAssetKeys: [`v1:${"a".repeat(64)}`],
      transfers: [
        {
          assetKey: `v1:${"a".repeat(64)}`,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000099",
        },
      ],
    },
  ])(
    "rejects duplicate, unselected, or wrong-destination transfers",
    async (input) => {
      await expect(
        new EmergencyReserveService().saveSettings({
          monthlyExpenses: 100,
          targetMonths: 6,
          ...input,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mocks.listLatestPositions).not.toHaveBeenCalled();
      expect(mocks.saveSettings).not.toHaveBeenCalled();
    },
  );

  it("suggests only fixed-income groups using estimates with imported-value fallback", async () => {
    const estimated = position({
      product: "CDB DI",
      assetCode: "CDBEST",
      totalValue: "50",
      estimatedValue: 60,
    });
    const imported = position({
      product: "CDB 115% CDI",
      assetCode: "CDBFALLBACK",
      totalValue: "40",
      estimatedValue: null,
    });
    const stock = position({
      product: "Ação XPTO",
      assetCode: "STOCK1",
      totalValue: "10000",
    });
    mocks.listLatestPositions.mockResolvedValue([estimated, imported, stock]);
    mocks.enrich.mockResolvedValue([estimated, imported, stock]);

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 100,
    });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: [
        {
          assetKeys: [
            getEmergencyReserveAssetKey(estimated),
            getEmergencyReserveAssetKey(imported),
          ],
          total: 100,
          difference: 0,
        },
      ],
    });
  });

  it("suggests a better exact combination with explicit transfer details", async () => {
    const eligible = position({ assetCode: "ELIGIBLE", totalValue: "20000" });
    const assigned = position({
      assetCode: "ASSIGNED",
      totalValue: "27322.95",
    });
    const eligibleKey = getEmergencyReserveAssetKey(eligible);
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listLatestPositions.mockResolvedValue([eligible, assigned]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          name: "Reserva",
        },
        { id: "00000000-0000-4000-8000-000000000099", name: "Viagem" },
      ],
      assignments: [
        {
          objectiveId: "00000000-0000-4000-8000-000000000099",
          assetKey: assignedKey,
        },
      ],
    });
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          id: "00000000-0000-4000-8000-000000000099",
          name: "Viagem",
          currentValue: 27322.95,
          targetAmount: 60000,
        },
      ],
      positions: [
        { assetKey: eligibleKey, value: 20000 },
        { assetKey: assignedKey, value: 27322.95 },
      ],
    });
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "2000",
      targetMonths: 12,
      selectedAssetKeys: [],
    });

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 47322.95,
      reserveTargetAmount: 30000,
    });

    expect(result.status).toBe("suggestions");
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.kind).toBe("exact");
    expect(result.candidates[0].assetKeys.slice().sort()).toEqual(
      [eligibleKey, assignedKey].sort(),
    );
    expect(result.candidates[0].total).toBe(47322.95);
    expect(result.candidates[0].transfers).toEqual([
      expect.objectContaining({
        assetKey: assignedKey,
        fromObjectiveId: "00000000-0000-4000-8000-000000000099",
        fromObjectiveName: "Viagem",
      }),
    ]);
    expect(result.candidates[0].impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          objectiveId: "00000000-0000-4000-8000-000000000099",
          currentValue: 0,
          targetAmount: 60000,
          progressPercent: 0,
        }),
        expect.objectContaining({
          objectiveId: "00000000-0000-4000-8000-000000000010",
          currentValue: 47322.95,
          targetAmount: 30000,
          progressPercent: 100,
        }),
      ]),
    );
    expect(mocks.getObjectivesOverview).toHaveBeenCalled();
  });

  it("uses safe fallbacks for an orphaned transfer with unknown valuation data", async () => {
    const assigned = position({
      assetCode: "ASSIGNED-NEAREST",
      totalValue: "80",
    });
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listLatestPositions.mockResolvedValue([assigned]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [],
      assignments: [
        { objectiveId: "deleted-objective", assetKey: assignedKey },
      ],
    });
    mocks.getSettings.mockResolvedValue(null);
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [],
      positions: [{ assetKey: assignedKey, value: null }],
    });

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 100,
    });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      candidates: [
        {
          assetKeys: [assignedKey],
          difference: 20,
          transfers: [{ value: 80, fromObjectiveName: "Outro objetivo" }],
          impacts: [
            { objectiveName: "Reserva", targetAmount: null },
            {
              objectiveName: "Outro objetivo",
              currentValue: null,
              knownValue: 0,
              targetAmount: null,
              progressPercent: null,
              transferredValue: 80,
              transferredPositionCount: 1,
            },
          ],
        },
      ],
    });
    expect(mocks.getSettings).toHaveBeenCalled();
  });

  it("prefers a strictly closer expanded combination and computes both impacts", async () => {
    const free = position({ assetCode: "FREE-NEAR", totalValue: "40" });
    const assigned = position({ assetCode: "GOAL-NEAR", totalValue: "55" });
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listLatestPositions.mockResolvedValue([free, assigned]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [{ id: "goal-trip", name: "Viagem" }],
      assignments: [{ objectiveId: "goal-trip", assetKey: assignedKey }],
    });
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "10.00",
      targetMonths: 12,
      selectedAssetKeys: [],
    });
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          id: "goal-trip",
          name: "Viagem",
          currentValue: 55,
          knownValue: 55,
          targetAmount: 100,
        },
      ],
      positions: [{ assetKey: assignedKey, value: 55 }],
    });

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 50,
    });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      candidates: [
        {
          assetKeys: [assignedKey],
          impacts: [
            { objectiveName: "Reserva", targetAmount: 120 },
            {
              objectiveName: "Viagem",
              currentValue: 0,
              targetAmount: 100,
              progressPercent: 0,
            },
          ],
        },
      ],
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates[0].impacts?.[0].progressPercent).toBeCloseTo(
      45.83,
    );
  });

  it("keeps an exact free and reserve combination ahead of transfer candidates", async () => {
    const free = position({ assetCode: "FREE", totalValue: "40" });
    const assigned = position({ assetCode: "ASSIGNED", totalValue: "60" });
    const freeKey = getEmergencyReserveAssetKey(free);
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listLatestPositions.mockResolvedValue([free, assigned]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [{ id: "goal-trip", name: "Viagem" }],
      assignments: [{ objectiveId: "goal-trip", assetKey: assignedKey }],
    });

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 40,
    });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "exact",
      candidates: [{ assetKeys: [freeKey], difference: 0 }],
    });
    expect(mocks.getObjectivesOverview).not.toHaveBeenCalled();
  });

  it("preserves the baseline when an expanded candidate only ties its difference", async () => {
    const free = position({ assetCode: "FREE-TIE", totalValue: "80" });
    const assigned = position({ assetCode: "GOAL-TIE", totalValue: "80" });
    const freeKey = getEmergencyReserveAssetKey(free);
    const assignedKey = getEmergencyReserveAssetKey(assigned);
    mocks.listLatestPositions.mockResolvedValue([free, assigned]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [{ id: "goal-trip", name: "Viagem" }],
      assignments: [{ objectiveId: "goal-trip", assetKey: assignedKey }],
    });

    const result = await new EmergencyReserveService().suggestPositions({
      targetAmount: 100,
    });

    expect(result).toMatchObject({
      status: "suggestions",
      kind: "nearest",
      candidates: [{ assetKeys: [freeKey], total: 80, difference: 20 }],
    });
    if (result.status !== "suggestions")
      throw new Error("Expected suggestions");
    expect(result.candidates[0]).not.toHaveProperty("transfers");
    expect(mocks.getObjectivesOverview).not.toHaveBeenCalled();
  });

  it("rejects an invalid suggestion target before loading positions", async () => {
    await expect(
      new EmergencyReserveService().suggestPositions({ targetAmount: 0 }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.listLatestPositions).not.toHaveBeenCalled();
  });

  it("returns no suggestions when current positions are not fixed income", async () => {
    const stock = position({ product: "Ação XPTO", assetCode: "STOCK1" });
    mocks.listLatestPositions.mockResolvedValue([stock]);

    await expect(
      new EmergencyReserveService().suggestPositions({ targetAmount: 100 }),
    ).resolves.toEqual({ status: "no_valued_positions" });
  });

  it("limits reserve holdings and its calculation to fixed-income classifications", async () => {
    const cdb = position({ totalValue: "100" });
    const stock = position({
      product: "Ação XPTO",
      assetCode: "STOCK1",
      totalValue: "200",
    });
    const fii = position({
      product: "FII XPTO",
      assetCode: "FII1",
      totalValue: "300",
    });
    mocks.listLatestPositions.mockResolvedValue([cdb, stock, fii]);
    mocks.enrich.mockResolvedValue([cdb, stock, fii]);
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "100",
      targetMonths: 10,
      selectedAssetKeys: [
        getEmergencyReserveAssetKey(cdb),
        getEmergencyReserveAssetKey(stock),
        getEmergencyReserveAssetKey(fii),
      ],
    });

    const data = await new EmergencyReserveService().getEditorData();

    expect(data.holdings.map((holding) => holding.product)).toEqual(["CDB DI"]);
    expect(data.selectedPositionCount).toBe(1);
    expect(data.calculation.selectedValue).toBe(100);
    expect(data.missingSelectionCount).toBe(2);
  });

  it("rejects current stock and fund selections before persisting reserve settings", async () => {
    const stock = position({ product: "Ação XPTO", assetCode: "STOCK1" });
    const fii = position({ product: "FII XPTO", assetCode: "FII1" });
    mocks.listLatestPositions.mockResolvedValue([stock, fii]);
    mocks.classifyPositions.mockImplementation(
      async (
        positions: Array<{
          product: string;
          assetCode: string | null;
          issuer: string | null;
          institution: string | null;
          indexer: string | null;
          regimeType: string | null;
        }>,
      ) =>
        positions.map(
          (item: {
            product: string;
            assetCode: string | null;
            issuer: string | null;
            institution: string | null;
            indexer: string | null;
            regimeType: string | null;
          }) => ({
            ...item,
            classification: { assetClass: "Renda fixa" },
          }),
        ),
    );

    await expect(
      new EmergencyReserveService().saveSettings({
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [
          getEmergencyReserveAssetKey(stock),
          getEmergencyReserveAssetKey(fii),
        ],
      }),
    ).rejects.toMatchObject({
      message:
        "A reserva só pode incluir posições classificadas como renda fixa. Revise a seleção antes de salvar.",
      statusCode: 400,
    });
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it("rejects positions already assigned to another objective", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [
        { id: "00000000-0000-4000-8000-000000000099", name: "Viagem" },
      ],
      assignments: [
        { objectiveId: "00000000-0000-4000-8000-000000000099", assetKey },
      ],
    });

    const save = new EmergencyReserveService().saveSettings({
      monthlyExpenses: 2000,
      targetMonths: 6,
      selectedAssetKeys: [assetKey],
    });
    await expect(save).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(save).rejects.toThrow("Viagem");
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it("accepts an explicitly requested transfer to the reserve", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [
        { id: "00000000-0000-4000-8000-000000000099", name: "Viagem" },
      ],
      assignments: [
        { objectiveId: "00000000-0000-4000-8000-000000000099", assetKey },
      ],
    });

    await new EmergencyReserveService().saveSettings({
      monthlyExpenses: 2000,
      targetMonths: 6,
      selectedAssetKeys: [assetKey],
      transfers: [
        {
          assetKey,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000010",
        },
      ],
    });

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      monthlyExpenses: "2000.00",
      targetMonths: 6,
      selectedAssetKeys: [assetKey],
      transfers: [
        {
          assetKey,
          fromObjectiveId: "00000000-0000-4000-8000-000000000099",
          toObjectiveId: "00000000-0000-4000-8000-000000000010",
        },
      ],
    });
  });

  it("rejects a transfer when its declared source is no longer assigned", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);

    await expect(
      new EmergencyReserveService().saveSettings({
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [assetKey],
        transfers: [
          {
            assetKey,
            fromObjectiveId: "00000000-0000-4000-8000-000000000099",
            toObjectiveId: "00000000-0000-4000-8000-000000000010",
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it("uses a safe fallback name for an orphaned objective assignment", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [],
      assignments: [{ objectiveId: "deleted-objective", assetKey }],
    });

    await expect(
      new EmergencyReserveService().saveSettings({
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [assetKey],
      }),
    ).rejects.toThrow("objetivo informado");
  });

  it("allows updating positions already assigned to the reserve", async () => {
    const cdb = position();
    const assetKey = getEmergencyReserveAssetKey(cdb);
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    mocks.listObjectives.mockResolvedValue({
      objectives: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          name: "Reserva",
        },
      ],
      assignments: [
        {
          objectiveId: "00000000-0000-4000-8000-000000000010",
          assetKey,
        },
      ],
    });

    await expect(
      new EmergencyReserveService().saveSettings({
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [assetKey],
      }),
    ).resolves.toBeDefined();

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      monthlyExpenses: "2000.00",
      targetMonths: 6,
      selectedAssetKeys: [assetKey],
    });
  });

  it("deduplicates selected asset keys when saving and returns refreshed data", async () => {
    const cdb = position();
    mocks.listLatestPositions.mockResolvedValue([cdb]);
    const service = new EmergencyReserveService();
    await service.saveSettings(
      {
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [
          getEmergencyReserveAssetKey(cdb),
          getEmergencyReserveAssetKey(cdb),
        ],
      },
      "request-3",
    );

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      monthlyExpenses: "2000.00",
      targetMonths: 6,
      selectedAssetKeys: [getEmergencyReserveAssetKey(cdb)],
    });
    expect(mocks.listLatestPositions).toHaveBeenCalledWith("request-3");
  });
});
