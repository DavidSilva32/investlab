const reconciliationRepository = vi.hoisted(() => ({
  listEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/backend/repositories/position-reconciliation.repository", () => ({
  positionReconciliationRepository: reconciliationRepository,
}));
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

  it("keeps unknown position origins unclassified", async () => {
    imports.listLatestPositions.mockResolvedValue([
      {
        id: "unknown-imported-origin",
        source: "LEGACY",
        product: "Ativo importado legado",
        assetCode: "ABC",
        indexer: null,
        totalValue: "100",
      },
    ]);
    manualPositions.list.mockResolvedValue([
      {
        id: "unknown-manual-origin",
        source: "LEGACY",
        product: "Ativo",
        assetCode: "ABC",
        indexer: null,
        totalValue: "100",
      },
    ]);

    const positions = await new PortfolioPositionService().listCurrent();

    expect(positions).toHaveLength(2);
    expect(positions[0]).not.toHaveProperty("source");
    expect(positions[1]).not.toHaveProperty("source");
  });

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

    expect(positions).toEqual([{ ...imported, source: "B3" }, manualRow]);
    expect(estimates.enrich).toHaveBeenCalledWith([
      { ...imported, source: "B3" },
    ]);
    expect(enriched).toEqual([
      expect.objectContaining({
        ...imported,
        source: "B3",
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
  estimates.enrich.mockResolvedValue([
    { ...imported, source: "B3", estimatedValue: 101 },
  ]);

  await expect(
    new PortfolioPositionService().listCurrentEnriched("request-1"),
  ).resolves.toEqual([
    {
      ...imported,
      source: "B3",
      estimatedValue: 101,
      canonicalValueCents: "10100",
      canonicalValueSource: "CDB_ESTIMATE",
      reportedValueCents: "10000",
    },
  ]);
  expect(imports.listLatestPositions).toHaveBeenCalledWith("request-1");
  expect(manualPositions.list).toHaveBeenCalledWith("request-1");
  expect(estimates.enrich).toHaveBeenCalledWith([
    { ...imported, source: "B3" },
  ]);
});

it("forwards a fixed execution valuation date to the CDI estimator", async () => {
  const imported = {
    product: "CDB",
    source: "B3",
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

it("keeps the imported value authoritative and applies current reversals without a new snapshot", async () => {
  const { importedReconciliationKey } =
    await import("@/backend/services/position-reconciliation");
  const position = {
    product: "Banco do Brasil",
    source: "B3",
    assetCode: "BBAS3",
    institution: "Corretora",
    indexer: null,
    totalValue: "1200",
    referenceDate: "2026-01-31",
  };
  const manualRow = {
    ...position,
    source: "MANUAL",
    assetKey: "manual:bbas",
    totalValue: "1000",
  };
  imports.listLatestPositions.mockResolvedValue([position]);
  manualPositions.list.mockResolvedValue([manualRow]);
  const event = {
    id: "1",
    manualAssetKey: manualRow.assetKey,
    importedAssetKey: importedReconciliationKey(position),
    status: "LINK",
    effectiveFrom: "2026-01-01",
    recordedAt: "2026-01-01T12:00:00Z",
  };
  reconciliationRepository.listEvents.mockResolvedValue([event]);
  expect(await new PortfolioPositionService().listCurrent()).toEqual([
    expect.objectContaining({
      assetKey: manualRow.assetKey,
      totalValue: "1200",
    }),
  ]);
  reconciliationRepository.listEvents.mockResolvedValue([
    event,
    {
      ...event,
      id: "2",
      status: "UNLINK",
      effectiveFrom: "2026-02-01",
      recordedAt: "2026-02-01T12:00:00Z",
    },
  ]);
  expect(await new PortfolioPositionService().listCurrent()).toEqual([
    position,
    manualRow,
  ]);
  reconciliationRepository.listEvents.mockResolvedValue([]);
});
