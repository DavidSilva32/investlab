import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ listLatestPositions: vi.fn() }));
const classifications = vi.hoisted(() => ({
  listByAssetKeys: vi.fn(),
  upsertMany: vi.fn(),
}));
const estimates = vi.hoisted(() => ({ enrich: vi.fn() }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
}));
vi.mock("@/backend/repositories/portfolio-classification.repository", () => ({
  portfolioClassificationRepository: classifications,
}));
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: estimates,
}));
import { PortfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { getPortfolioAssetKey } from "@/backend/services/portfolio-classification";

const position = {
  id: "b8b74f5e-784e-4ef6-aa9e-3ad9b330ca1a",
  product: "CDB",
  assetCode: "CDB-123",
  institution: "Banco Exemplo",
  issuer: "Banco Emissor",
  indexer: "CDI",
  regimeType: null,
};
const secondPosition = {
  ...position,
  id: "a98bde34-1730-42ab-8c9c-97a88b52a7df",
  product: "Fundo imobiliário",
  assetCode: "FII-456",
};

describe("PortfolioAllocationService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies persisted adjustments before conservative import suggestions", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    estimates.enrich.mockResolvedValue([{ ...position, estimatedValue: 100 }]);
    classifications.listByAssetKeys.mockResolvedValue([
      {
        assetKey: getPortfolioAssetKey(position),
        assetClass: "Renda fixa",
        subClass: "CDB CDI",
        geography: "Brasil",
      },
    ]);

    await expect(
      new PortfolioAllocationService().getAllocation(),
    ).resolves.toMatchObject([
      {
        estimatedValue: 100,
        classification: {
          assetClass: "Renda fixa",
          subClass: "CDB CDI",
          geography: "Brasil",
        },
        classificationSource: "manual",
      },
    ]);
  });

  it("uses imported suggestions and keeps unsupported geography unknown", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    estimates.enrich.mockResolvedValue([position]);
    classifications.listByAssetKeys.mockResolvedValue([]);

    await expect(
      new PortfolioAllocationService().getAllocation(),
    ).resolves.toMatchObject([
      {
        classification: {
          assetClass: "Renda fixa",
          subClass: "CDB",
          geography: null,
        },
        classificationSource: "inferred",
      },
    ]);
  });

  it("marks unsupported imported data as unclassified", async () => {
    const unknown = { ...position, product: "Produto externo", indexer: null };
    repository.listLatestPositions.mockResolvedValue([unknown]);
    estimates.enrich.mockResolvedValue([unknown]);
    classifications.listByAssetKeys.mockResolvedValue([]);

    await expect(
      new PortfolioAllocationService().getAllocation(),
    ).resolves.toMatchObject([
      {
        classification: { assetClass: null, subClass: null, geography: null },
        classificationSource: "unclassified",
      },
    ]);
  });

  it("merges selected fields, clears explicit nulls, and deduplicates identical assets", async () => {
    const duplicatePosition = {
      ...position,
      id: "e05c0a4d-ace8-49ae-a670-74723a9ff983",
    };
    repository.listLatestPositions.mockResolvedValue([
      position,
      duplicatePosition,
      secondPosition,
    ]);
    classifications.listByAssetKeys.mockResolvedValue([
      {
        assetKey: getPortfolioAssetKey(position),
        assetClass: "Renda fixa",
        subClass: "CDB CDI",
        geography: "Brasil",
      },
    ]);
    classifications.upsertMany.mockImplementation(async (records) => records);

    await expect(
      new PortfolioAllocationService().updateClassifications({
        positionIds: [position.id, duplicatePosition.id, secondPosition.id],
        geography: null,
      }),
    ).resolves.toEqual({ count: 3 });
    expect(classifications.upsertMany).toHaveBeenCalledWith(
      [
        {
          assetKey: getPortfolioAssetKey(position),
          assetClass: "Renda fixa",
          subClass: "CDB CDI",
          geography: null,
        },
        {
          assetKey: getPortfolioAssetKey(secondPosition),
          assetClass: "Fundos",
          subClass: "Fundo imobiliário",
          geography: null,
        },
      ],
      undefined,
    );
  });

  it("rejects stale or partially missing position IDs before writing", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    const service = new PortfolioAllocationService();
    await expect(
      service.updateClassifications({
        positionIds: [position.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        assetClass: null,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(classifications.upsertMany).not.toHaveBeenCalled();
  });

  it("uses explicit values, including nulls, for every selected field", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    classifications.listByAssetKeys.mockResolvedValue([]);
    classifications.upsertMany.mockImplementation(async (records) => records);

    await expect(
      new PortfolioAllocationService().updateClassifications({
        positionIds: [position.id],
        assetClass: null,
        subClass: null,
        geography: "Exterior",
      }),
    ).resolves.toEqual({ count: 1 });
    expect(classifications.upsertMany).toHaveBeenCalledWith(
      [
        {
          assetKey: getPortfolioAssetKey(position),
          assetClass: null,
          subClass: null,
          geography: "Exterior",
        },
      ],
      undefined,
    );
  });

  it("keeps the inferred geography when the update omits geography", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    classifications.listByAssetKeys.mockResolvedValue([]);
    classifications.upsertMany.mockImplementation(async (records) => records);

    await new PortfolioAllocationService().updateClassifications({
      positionIds: [position.id],
      assetClass: "Renda fixa",
    });
    expect(classifications.upsertMany).toHaveBeenCalledWith(
      [
        {
          assetKey: getPortfolioAssetKey(position),
          assetClass: "Renda fixa",
          subClass: "CDB",
          geography: null,
        },
      ],
      undefined,
    );
  });
});
