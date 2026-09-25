import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listLatestPositions: vi.fn(),
  getSettings: vi.fn(),
  saveSettings: vi.fn(),
  enrich: vi.fn(),
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
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: { enrich: mocks.enrich },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import {
  EmergencyReserveService,
  getEmergencyReserveAssetKey,
} from "@/backend/services/emergency-reserve.service";

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
    mocks.getSettings.mockResolvedValue(null);
    mocks.saveSettings.mockResolvedValue(undefined);
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
    const valued = position({ estimatedValue: null, totalValue: "150" });
    const noValue = position({
      assetCode: "CDB999",
      estimatedValue: null,
      totalValue: "not-a-number",
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
      valued,
      noValue,
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

  it("deduplicates selected asset keys when saving and returns refreshed data", async () => {
    const service = new EmergencyReserveService();
    await service.saveSettings(
      {
        monthlyExpenses: 2000,
        targetMonths: 6,
        selectedAssetKeys: [`v1:${"b".repeat(64)}`, `v1:${"b".repeat(64)}`],
      },
      "request-3",
    );

    expect(mocks.saveSettings).toHaveBeenCalledWith({
      monthlyExpenses: "2000.00",
      targetMonths: 6,
      selectedAssetKeys: [`v1:${"b".repeat(64)}`],
    });
    expect(mocks.listLatestPositions).toHaveBeenCalledWith("request-3");
  });
});
