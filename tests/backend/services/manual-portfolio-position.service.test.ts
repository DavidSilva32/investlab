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
  it("creates a BRL total-value position with optional identity fields omitted", async () => {
    repository.create.mockImplementation(async (value) => ({
      ...saved(),
      ...value,
      currency: "BRL",
      assetCode: null,
      institution: null,
      valueBasis: "total_value",
      totalValue: "400.00000000",
    }));
    const result = await new ManualPortfolioPositionService().create({
      product: "Tesouro Direto",
      quantity: 1,
      currency: "BRL",
      valueBasis: "total_value",
      totalValue: 400,
      positionDate: "2026-09-20",
    });
    expect(result.totalValue).toBe("400.00000000");
    expect(result.assetCode).toBeNull();
    expect(result.institution).toBeNull();
  });

  it("validates total-value inputs and rejects conversion for BRL", async () => {
    const service = new ManualPortfolioPositionService();
    await expect(
      service.create({ ...input, valueBasis: "total_value", totalValue: null }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create({ ...input, unitPrice: null }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create({
        ...input,
        currency: "BRL",
        convertedValueBrl: 200,
        conversionDate: "2026-09-20",
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create({ ...input, conversionDate: "2026-09-20" }),
    ).rejects.toBeInstanceOf(ApplicationError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("updates positions, validates update input, and reports a missing position", async () => {
    repository.update.mockResolvedValue(
      saved({
        currency: "BRL",
        convertedValueBrl: null,
        totalValue: "400.00000000",
        valueBasis: "total_value",
      }),
    );
    const service = new ManualPortfolioPositionService();
    const result = await service.update(
      "position-id",
      {
        ...input,
        currency: "BRL",
        valueBasis: "total_value",
        unitPrice: null,
        totalValue: 400,
      },
      "req",
    );
    expect(repository.update).toHaveBeenCalledWith(
      "position-id",
      expect.objectContaining({ totalValue: "400.00000000", unitPrice: null }),
      "req",
    );
    expect(result.totalValue).toBe("400.00000000");
    await expect(
      service.update("position-id", { ...input, quantity: -1 }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.update("position-id", {
        ...input,
        quantity: 1_000_000_000_000,
        unitPrice: 1_000_000_000_000,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    repository.update.mockResolvedValue(
      saved({
        assetCode: null,
        institution: null,
        currency: "USD",
        convertedValueBrl: "980.00000000",
        conversionDate: "2026-09-19",
      }),
    );
    await service.update("position-id", {
      ...input,
      assetCode: null,
      institution: null,
      convertedValueBrl: 980,
      conversionDate: "2026-09-19",
    });
    expect(repository.update).toHaveBeenLastCalledWith(
      "position-id",
      expect.objectContaining({
        assetCode: null,
        institution: null,
        convertedValueBrl: "980.00000000",
        conversionDate: "2026-09-19",
      }),
      undefined,
    );
    repository.update.mockResolvedValue(null);
    await expect(service.update("missing", { ...input })).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it("deletes positions and reports missing identifiers", async () => {
    repository.delete.mockResolvedValue({ id: "position-id" });
    const service = new ManualPortfolioPositionService();
    await expect(service.delete("position-id", "req")).resolves.toEqual({
      id: "position-id",
    });
    repository.delete.mockResolvedValue(null);
    await expect(service.delete("missing")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("marks unrecognized or missing asset codes as not duplicated", async () => {
    repository.list.mockResolvedValue([
      saved({ id: "first", assetCode: null }),
      saved({ id: "second", assetCode: "VX" }),
    ]);
    const result = await new ManualPortfolioPositionService().list();
    expect(result.map((position) => position.duplicateAssetCode)).toEqual([
      false,
      false,
    ]);
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
