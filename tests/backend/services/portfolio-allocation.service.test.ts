import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ listLatestPositions: vi.fn() }));
const classifications = vi.hoisted(() => ({
  listByAssetKeys: vi.fn(),
  upsert: vi.fn(),
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
    repository.listLatestPositions.mockResolvedValue([
      { ...position, product: "Produto externo", indexer: null },
    ]);
    estimates.enrich.mockResolvedValue([
      { ...position, product: "Produto externo", indexer: null },
    ]);
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
  it("persists edits only for positions in the latest snapshot", async () => {
    repository.listLatestPositions.mockResolvedValue([position]);
    classifications.upsert.mockResolvedValue({ assetClass: "Fundos" });
    const service = new PortfolioAllocationService();
    await service.updateClassification({
      positionId: position.id,
      assetClass: "Fundos",
      subClass: "FII",
      geography: "Brasil",
    });
    expect(classifications.upsert).toHaveBeenCalledWith(
      {
        assetKey: getPortfolioAssetKey(position),
        assetClass: "Fundos",
        subClass: "FII",
        geography: "Brasil",
      },
      undefined,
    );
    await expect(
      service.updateClassification({
        positionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        assetClass: null,
        subClass: null,
        geography: null,
      }),
    ).rejects.toThrow("A posição não está mais na carteira atual.");
  });
});
