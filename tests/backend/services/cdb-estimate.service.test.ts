import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listConfigurations: vi.fn(),
  listRatesFrom: vi.fn(),
  cacheRates: vi.fn(),
}));
const bcb = vi.hoisted(() => ({ fetchRates: vi.fn() }));
vi.mock("@/backend/repositories/cdb-rate.repository", () => ({
  cdbRateRepository: repository,
}));
vi.mock("@/backend/services/bcb-cdi.service", () => ({ bcbCdiService: bcb }));
import { enrichCdbEstimates } from "@/backend/services/cdb-estimate.service";

const cdb = {
  product: "CDB - BANCO",
  assetCode: "CDB1",
  indexer: "DI",
  totalValue: "1000",
  estimationBaseDate: "2026-09-16",
};

describe("enrichCdbEstimates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it("does not estimate a CDB without a configured percentage", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    await expect(enrichCdbEstimates([cdb])).resolves.toEqual([
      { ...cdb, cdiPercentage: null, estimatedValue: null },
    ]);
    expect(repository.listRatesFrom).not.toHaveBeenCalled();
  });
  it("uses cached rates and preserves the imported official value", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "110" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-16", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockResolvedValue([]);
    const [result] = await enrichCdbEstimates([cdb]);
    expect(result.totalValue).toBe("1000");
    expect(result.cdiPercentage).toBe("110");
    expect(result.estimatedValue).toBeGreaterThan(1000);
    expect(repository.listRatesFrom).toHaveBeenCalledWith(
      "2026-09-16",
      "2026-09-20",
    );
  });
  it("fetches and caches missing official rates after the operational base date", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-18", annualRate: "14.9" },
      { date: "2026-09-17", annualRate: "14.9" },
    ]);
    const [result] = await enrichCdbEstimates([cdb]);
    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-16", "2026-09-20");
    expect(repository.cacheRates).toHaveBeenCalled();
    expect(result.estimatedValue).toBeGreaterThan(1000);
  });
  it("does not estimate unsupported assets, positions without a base date, or a base date today", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    const results = await enrichCdbEstimates([
      { ...cdb, product: "Tesouro", assetCode: "TES", indexer: "SELIC" },
      { ...cdb, estimationBaseDate: null },
      { ...cdb, estimationBaseDate: "2026-09-20" },
    ]);
    expect(results.every((result) => result.estimatedValue === null)).toBe(
      true,
    );
  });
  it("does not fetch when cache is current and leaves the estimate empty without rates", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-20", annualRate: "14.9" },
    ]);
    await enrichCdbEstimates([cdb]);
    expect(bcb.fetchRates).not.toHaveBeenCalled();
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([]);
    const [result] = await enrichCdbEstimates([cdb]);
    expect(result.estimatedValue).toBeNull();
  });
});

it("does not configure a non-CDB with no code", async () => {
  repository.listConfigurations.mockResolvedValue([]);
  const [result] = await enrichCdbEstimates([
    { product: "CDB", assetCode: null, indexer: null, totalValue: null },
  ]);
  expect(result).toMatchObject({ cdiPercentage: null, estimatedValue: null });
  expect(repository.listConfigurations).toHaveBeenCalledWith([]);
});

it("does not estimate a CDB tied to another indexer", async () => {
  repository.listConfigurations.mockResolvedValue([]);
  const [result] = await enrichCdbEstimates([{ ...cdb, indexer: "IPCA" }]);
  expect(result.estimatedValue).toBeNull();
});

it("does not estimate a CDB without an indexer or value even when configured", async () => {
  repository.listConfigurations.mockResolvedValue([
    { assetCode: "CDB1", cdiPercentage: "100" },
  ]);
  const results = await enrichCdbEstimates([
    { ...cdb, indexer: null },
    { ...cdb, totalValue: null },
    { ...cdb, estimationBaseDate: undefined },
  ]);
  expect(results.every((result) => result.estimatedValue === null)).toBe(true);
});
