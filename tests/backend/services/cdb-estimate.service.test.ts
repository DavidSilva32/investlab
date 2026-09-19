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
import { estimatePostFixedCdb } from "@/backend/services/cdb-cdi-estimator";
import { CdbEstimateService } from "@/backend/services/cdb-estimate.service";

const cdb = {
  product: "CDB - BANCO",
  assetCode: "CDB1",
  indexer: "DI",
  totalValue: "1000",
  estimationBaseDate: "2026-09-16",
};

describe("CdbEstimateService.enrich", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());
  it("does not estimate a CDB without a configured percentage", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    await expect(new CdbEstimateService().enrich([cdb])).resolves.toEqual([
      {
        ...cdb,
        cdiPercentage: null,
        estimatedValue: null,
        cdbEstimateStatus: null,
      },
    ]);
    expect(repository.listRatesFrom).not.toHaveBeenCalled();
  });
  it("uses cached rates and preserves the imported official value", async () => {
    vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "110" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-16", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockResolvedValue([]);
    const [result] = await new CdbEstimateService().enrich([cdb]);
    expect(result.totalValue).toBe("1000");
    expect(result.cdiPercentage).toBe("110");
    expect(result.estimatedValue).toBeGreaterThan(1000);
    expect(repository.listRatesFrom).toHaveBeenCalledWith(
      "2026-09-16",
      "2026-09-18",
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
    const [result] = await new CdbEstimateService().enrich([cdb]);
    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-15", "2026-09-20");
    expect(repository.cacheRates).toHaveBeenCalled();
    expect(result.estimatedValue).toBe(
      estimatePostFixedCdb({
        officialValue: "1000",
        cdiPercentage: "100",
        rates: [{ annualRate: "14.9" }, { annualRate: "14.9" }],
      }),
    );
  });
  it("does not estimate unsupported assets, positions without a base date, or a base date today", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    const results = await new CdbEstimateService().enrich([
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
    await new CdbEstimateService().enrich([cdb]);
    expect(bcb.fetchRates).not.toHaveBeenCalled();
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([]);
    const [result] = await new CdbEstimateService().enrich([cdb]);
    expect(result.estimatedValue).toBeNull();
  });
});

it("does not configure a non-CDB with no code", async () => {
  repository.listConfigurations.mockResolvedValue([]);
  const [result] = await new CdbEstimateService().enrich([
    { product: "CDB", assetCode: null, indexer: null, totalValue: null },
  ]);
  expect(result).toMatchObject({ cdiPercentage: null, estimatedValue: null });
  expect(repository.listConfigurations).toHaveBeenCalledWith([]);
});

it("does not estimate a CDB tied to another indexer", async () => {
  repository.listConfigurations.mockResolvedValue([]);
  const [result] = await new CdbEstimateService().enrich([
    { ...cdb, indexer: "IPCA" },
  ]);
  expect(result.estimatedValue).toBeNull();
});

it("does not estimate a CDB without an indexer or value even when configured", async () => {
  repository.listConfigurations.mockResolvedValue([
    { assetCode: "CDB1", cdiPercentage: "100" },
  ]);
  const results = await new CdbEstimateService().enrich([
    { ...cdb, indexer: null },
    { ...cdb, totalValue: null },
    { ...cdb, estimationBaseDate: undefined },
  ]);
  expect(results.every((result) => result.estimatedValue === null)).toBe(true);
});

describe("with a deterministic Sao Paulo date", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps official CDB values when the BCB CDI request is unavailable", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
      { assetCode: "CDB2", cdiPercentage: "110" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockRejectedValue(new Error("BCB unavailable"));

    const results = await new CdbEstimateService().enrich([
      cdb,
      { ...cdb, assetCode: "CDB2", totalValue: "2000" },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        ...cdb,
        cdiPercentage: "100",
        estimatedValue: null,
        cdbEstimateStatus: "unavailable",
      },
      {
        ...cdb,
        assetCode: "CDB2",
        totalValue: "2000",
        cdiPercentage: "110",
        estimatedValue: null,
        cdbEstimateStatus: "unavailable",
      },
    ]);
  });

  it("uses the last cached CDI for one missing weekday when BCB is unavailable", async () => {
    vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-21", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockRejectedValue(new Error("BCB unavailable"));

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, estimationBaseDate: "2026-09-21" },
    ]);

    expect(result).toMatchObject({
      cdbEstimateStatus: "provisional",
      cdiPercentage: "100",
      estimatedThrough: "2026-09-22",
    });
    expect(result.estimatedValue).toBe(
      estimatePostFixedCdb({
        officialValue: "1000",
        cdiPercentage: "100",
        rates: [{ annualRate: "14.9" }, { annualRate: "14.9" }],
      }),
    );
  });
  it("keeps the B3 value when more than one CDI weekday is missing", async () => {
    vi.setSystemTime(new Date("2026-09-24T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-21", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockRejectedValue(new Error("BCB unavailable"));

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, estimationBaseDate: "2026-09-21" },
    ]);

    expect(result).toMatchObject({
      cdbEstimateStatus: "unavailable",
      estimatedValue: null,
    });
  });
  it("projects a base-date weekday from the prior confirmed CDI", async () => {
    vi.setSystemTime(new Date("2026-09-19T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-17", annualRate: "13.65" },
    ]);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, estimationBaseDate: "2026-09-18" },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-17", "2026-09-19");
    expect(result).toMatchObject({
      cdbEstimateStatus: "provisional",
      estimatedThrough: "2026-09-18",
    });
    expect(result.estimatedValue).toBe(
      estimatePostFixedCdb({
        officialValue: "1000",
        cdiPercentage: "100",
        rates: [{ annualRate: "13.65" }],
      }),
    );
  });
  it("batches a CDI refresh for CDBs with different base dates", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
      { assetCode: "CDB2", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-18", annualRate: "14.9" },
    ]);

    await new CdbEstimateService().enrich([
      cdb,
      {
        ...cdb,
        assetCode: "CDB2",
        estimationBaseDate: "2026-09-17",
      },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledTimes(1);
    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-15", "2026-09-20");
    expect(repository.cacheRates).toHaveBeenCalledTimes(1);
  });

  it("sorts cached CDI rates before deciding whether a refresh is required", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-20", annualRate: "14.9" },
      { rateDate: "2026-09-16", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([cdb]);

    expect(bcb.fetchRates).not.toHaveBeenCalled();
    expect(result.estimatedValue).toBe(
      estimatePostFixedCdb({
        officialValue: "1000",
        cdiPercentage: "100",
        rates: [{ annualRate: "14.9" }, { annualRate: "14.9" }],
      }),
    );
  });
});
