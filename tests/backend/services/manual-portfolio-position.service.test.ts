import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/backend/repositories/manual-portfolio-position.repository", () => ({
  manualPortfolioPositionRepository: repository,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { ManualPortfolioPositionService } from "@/backend/services/manual-portfolio-position.service";

const input = {
  product: "ETF internacional",
  assetCode: "VT",
  institution: "Corretora",
  quantity: 2,
  currency: "USD",
  valueBasis: "unit_price",
  unitPrice: 100,
  positionDate: "2026-09-20",
};
const timestamp = new Date("2026-09-20T12:00:00Z");
const saved = (overrides: Record<string, unknown> = {}) => ({
  id: "2c817801-6cdf-46f1-a370-67446bd3bf49",
  assetKey: "manual:2c817801-6cdf-46f1-a370-67446bd3bf49",
  product: "ETF internacional",
  assetCode: "VT",
  institution: "Corretora",
  quantity: "2.00000000",
  currency: "USD",
  unitPrice: "100.00000000",
  totalValue: "200.00000000",
  valueBasis: "unit_price",
  positionDate: "2026-09-20",
  convertedValueBrl: null,
  conversionDate: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

describe("ManualPortfolioPositionService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores unit-price positions and leaves foreign currency out of BRL totals without conversion", async () => {
    repository.create.mockImplementation(async (value) => ({
      ...saved(),
      ...value,
    }));
    const result = await new ManualPortfolioPositionService().create(input);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: "2.00000000",
        unitPrice: "100.00000000",
        totalValue: "200.00000000",
        currency: "USD",
        convertedValueBrl: null,
      }),
      undefined,
    );
    expect(result.source).toBe("MANUAL");
    expect(result.totalValue).toBeNull();
    expect(result.reportedTotalValue).toBe("200.00000000");
    expect(result.assetKey).toMatch(/^manual:/);
  });

  it("uses only an explicitly dated user conversion in the BRL portfolio value", async () => {
    repository.create.mockImplementation(async (value) => ({
      ...saved(),
      ...value,
      id: "0fefb48f-b6d9-4b8e-890d-95fe4fe7b305",
    }));
    const result = await new ManualPortfolioPositionService().create({
      ...input,
      convertedValueBrl: 980,
      conversionDate: "2026-09-19",
    });
    expect(result.totalValue).toBe("980.00000000");
    expect(result.conversionDate).toBe("2026-09-19");
  });

  it("rejects invalid amounts, dates, and conversions without a matching date", async () => {
    const service = new ManualPortfolioPositionService();
    await expect(
      service.create({ ...input, quantity: 0 }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create({ ...input, positionDate: "2026-02-30" }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create({ ...input, convertedValueBrl: 900 }),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it(`rejects a calculated total above the accepted limit`, async () => {
    await expect(
      new ManualPortfolioPositionService().create({
        ...input,
        quantity: 1_000_000_000_000,
        unitPrice: 1_000_000_000_000,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it("marks repeated manual asset codes so the interface can surface ambiguity", async () => {
    repository.list.mockResolvedValue([
      saved(),
      saved({ id: "b70a8034-09d5-4cb6-b7bf-e04f7928bce0", assetCode: "vt" }),
    ]);
    const result = await new ManualPortfolioPositionService().list();
    expect(result.map((position) => position.duplicateAssetCode)).toEqual([
      true,
      true,
    ]);
  });
});
