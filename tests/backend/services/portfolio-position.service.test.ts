import { beforeEach, describe, expect, it, vi } from "vitest";

const imports = vi.hoisted(() => ({ listLatestPositions: vi.fn() }));
const manualPositions = vi.hoisted(() => ({ list: vi.fn() }));
const estimates = vi.hoisted(() => ({ enrich: vi.fn() }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: imports,
}));
vi.mock("@/backend/services/manual-portfolio-position.service", () => ({
  manualPortfolioPositionService: manualPositions,
}));
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: estimates,
}));

import { PortfolioPositionService } from "@/backend/services/portfolio-position.service";

describe("PortfolioPositionService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("combines imported and manual positions but only estimates imported positions", async () => {
    const imported = {
      id: "b3-position",
      product: "CDB",
      assetCode: "CDB1",
      indexer: "CDI",
      totalValue: "100",
    };
    const manualRow = {
      id: "manual-position",
      source: "MANUAL",
      product: "Ação internacional",
      assetCode: "XYZ",
      indexer: null,
      totalValue: null,
    };
    imports.listLatestPositions.mockResolvedValue([imported]);
    manualPositions.list.mockResolvedValue([manualRow]);
    estimates.enrich.mockImplementation(async (positions) => positions);

    const service = new PortfolioPositionService();
    const positions = await service.listCurrent();
    const enriched = await service.enrichImportedPositions(positions);

    expect(positions).toEqual([imported, manualRow]);
    expect(estimates.enrich).toHaveBeenCalledWith([imported]);
    expect(enriched).toEqual([
      expect.objectContaining({
        ...imported,
        canonicalValueCents: "10000",
        canonicalValueSource: "B3_IMPORTED",
      }),
      expect.objectContaining({
        ...manualRow,
        cdiPercentage: null,
        estimatedValue: null,
        cdbEstimateStatus: null,
        canonicalValueCents: null,
        canonicalValueSource: "UNVALUED",
      }),
    ]);
  });
});

it("uses listCurrentEnriched to combine and enrich the current snapshot", async () => {
  const imported = {
    id: "current-imported",
    product: "CDB",
    assetCode: "CDB1",
    indexer: "CDI",
    totalValue: "100",
  };
  imports.listLatestPositions.mockResolvedValue([imported]);
  manualPositions.list.mockResolvedValue([]);
  estimates.enrich.mockResolvedValue([{ ...imported, estimatedValue: 101 }]);

  await expect(
    new PortfolioPositionService().listCurrentEnriched("request-1"),
  ).resolves.toEqual([
    {
      ...imported,
      estimatedValue: 101,
      canonicalValueCents: "10100",
      canonicalValueSource: "CDB_ESTIMATE",
      reportedValueCents: "10000",
    },
  ]);
  expect(imports.listLatestPositions).toHaveBeenCalledWith("request-1");
  expect(manualPositions.list).toHaveBeenCalledWith("request-1");
  expect(estimates.enrich).toHaveBeenCalledWith([imported]);
});

it("forwards a fixed execution valuation date to the CDI estimator", async () => {
  const imported = {
    product: "CDB",
    assetCode: "CDB1",
    indexer: "CDI",
    totalValue: "100",
  };
  imports.listLatestPositions.mockResolvedValue([imported]);
  manualPositions.list.mockResolvedValue([]);
  estimates.enrich.mockResolvedValue([imported]);

  await new PortfolioPositionService().listCurrentEnriched(
    "request-1",
    "2026-09-30",
  );

  expect(estimates.enrich).toHaveBeenCalledWith([imported], "2026-09-30");
});
