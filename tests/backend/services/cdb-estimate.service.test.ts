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
  referenceDate: "2026-09-16",
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
        estimatedValueCents: null,
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
      { rateDate: "2026-09-17", annualRate: "14.9" },
    ]);
    const [result] = await new CdbEstimateService().enrich([cdb]);
    expect(result.totalValue).toBe("1000");
    expect(result.cdiPercentage).toBe("110");
    expect(result.estimatedValue).toBeGreaterThan(1000);
    expect(repository.listRatesFrom).toHaveBeenCalledTimes(2);
    expect(repository.listRatesFrom).toHaveBeenNthCalledWith(
      1,
      "2026-09-16",
      "2026-09-18",
    );
    expect(repository.listRatesFrom).toHaveBeenNthCalledWith(
      2,
      "2026-09-16",
      "2026-09-18",
    );
  });
  it("reproduces the 47,322.08/47,322.95 split and ignores changed BCB data for a persisted date", async () => {
    vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
    const officialValue = "47296.00520902593";
    const canonicalRates = [
      { rateDate: "2026-09-16", annualRate: "14.9" },
      { rateDate: "2026-09-17", annualRate: "0" },
    ];
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom
      .mockResolvedValueOnce([canonicalRates[0]])
      .mockResolvedValue(canonicalRates);
    bcb.fetchRates
      .mockResolvedValueOnce([
        { date: "2026-09-16", annualRate: "15.433554039399745" },
        { date: "2026-09-17", annualRate: "0" },
      ])
      .mockResolvedValueOnce([
        { date: "2026-09-16", annualRate: "16.5" },
        { date: "2026-09-17", annualRate: "0" },
      ]);
    const service = new CdbEstimateService();
    const first = await service.enrich([{ ...cdb, totalValue: officialValue }]);
    repository.listRatesFrom
      .mockReset()
      .mockResolvedValueOnce([canonicalRates[0]])
      .mockResolvedValueOnce(canonicalRates);
    bcb.fetchRates.mockReset().mockResolvedValue([
      { date: "2026-09-16", annualRate: "16.5" },
      { date: "2026-09-17", annualRate: "0" },
    ]);
    const second = await service.enrich([
      { ...cdb, totalValue: officialValue },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledTimes(1);
    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-17", "2026-09-18");
    expect(repository.cacheRates).toHaveBeenNthCalledWith(1, [
      { date: "2026-09-17", annualRate: "0" },
    ]);
    expect(repository.cacheRates).toHaveBeenNthCalledWith(2, [
      { date: "2026-09-17", annualRate: "0" },
    ]);
    expect(repository.listRatesFrom).toHaveBeenCalledTimes(2);
    expect(first[0]).toMatchObject({
      totalValue: officialValue,
      estimatedValue: 47322.08,
      estimatedValueCents: "4732208",
      cdbEstimateStatus: "official",
    });
    expect(second[0]).toEqual(first[0]);
    expect(
      estimatePostFixedCdb({
        officialValue,
        cdiPercentage: "100",
        rates: [{ annualRate: "15.433554039399745" }, { annualRate: "0" }],
      }).estimatedValue,
    ).toBe(47322.95);
    expect(
      estimatePostFixedCdb({
        officialValue,
        cdiPercentage: "100",
        rates: canonicalRates,
      }).estimatedValue,
    ).toBe(47322.08);
  });
  it("uses only a valuation date captured once at the start of enrichment", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    const getValuationDate = vi.fn(() => "2026-09-20");
    await new CdbEstimateService(getValuationDate).enrich([cdb]);
    expect(getValuationDate).toHaveBeenCalledTimes(1);
  });

  it("uses the valuation date supplied by the enclosing request", async () => {
    const getValuationDate = vi.fn(() => "2026-10-01");
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-16", annualRate: "14.9" },
      { rateDate: "2026-09-17", annualRate: "14.9" },
      { rateDate: "2026-09-18", annualRate: "14.9" },
    ]);

    await new CdbEstimateService(getValuationDate).enrich([cdb], "2026-09-19");

    expect(getValuationDate).not.toHaveBeenCalled();
    expect(repository.listRatesFrom).toHaveBeenCalledWith(
      "2026-09-16",
      "2026-09-19",
    );
  });

  it("uses the persisted winner when a concurrent insert wins a CDI date", async () => {
    vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
    const officialValue = "47296.00520902593";
    const originalRate = { rateDate: "2026-09-16", annualRate: "14.9" };
    const concurrentRate = { rateDate: "2026-09-17", annualRate: "0" };
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom
      .mockResolvedValueOnce([originalRate])
      .mockResolvedValueOnce([originalRate, concurrentRate]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-16", annualRate: "15.433554039399745" },
      { date: "2026-09-17", annualRate: "14.9" },
    ]);
    repository.cacheRates.mockResolvedValue(undefined);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, totalValue: officialValue },
    ]);

    expect(repository.cacheRates).toHaveBeenCalledWith([
      { date: "2026-09-17", annualRate: "14.9" },
    ]);
    expect(result).toMatchObject({
      estimatedValue: 47322.08,
      estimatedValueCents: "4732208",
      cdbEstimateStatus: "official",
    });
  });
  it("does not estimate unsupported assets, positions without a base date, or a base date today", async () => {
    repository.listConfigurations.mockResolvedValue([]);
    const results = await new CdbEstimateService().enrich([
      { ...cdb, product: "Tesouro", assetCode: "TES", indexer: "SELIC" },
      { ...cdb, referenceDate: null },
      { ...cdb, referenceDate: "2026-09-20" },
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
      { rateDate: "2026-09-16", annualRate: "14.9" },
      { rateDate: "2026-09-17", annualRate: "14.9" },
      { rateDate: "2026-09-18", annualRate: "14.9" },
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
    { ...cdb, referenceDate: undefined },
  ]);
  expect(results.every((result) => result.estimatedValue === null)).toBe(true);
});

describe("with a deterministic Sao Paulo date", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("keeps the same estimate when BCB fails but the persisted range is complete", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
      { assetCode: "CDB2", cdiPercentage: "110" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-16", annualRate: "14.9" },
      { rateDate: "2026-09-17", annualRate: "14.9" },
      { rateDate: "2026-09-18", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockRejectedValue(new Error("BCB unavailable"));

    const results = await new CdbEstimateService().enrich([
      cdb,
      { ...cdb, assetCode: "CDB2", totalValue: "2000" },
    ]);

    expect(bcb.fetchRates).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({
      totalValue: "1000",
      cdiPercentage: "100",
      estimatedValue: expect.any(Number),
      estimatedValueCents: expect.any(String),
      cdbEstimateStatus: "official",
    });
    expect(results[1]).toMatchObject({
      totalValue: "2000",
      cdiPercentage: "110",
      estimatedValue: expect.any(Number),
      estimatedValueCents: expect.any(String),
      cdbEstimateStatus: "official",
    });
  });

  it("changes cents only after a new canonical persisted CDI rate is available", async () => {
    vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
    const firstRate = { rateDate: "2026-09-16", annualRate: "14.9" };
    const newRate = { rateDate: "2026-09-17", annualRate: "14.9" };
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom
      .mockResolvedValueOnce([firstRate])
      .mockResolvedValue([firstRate, newRate]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-17", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, totalValue: "1000" },
    ]);
    const expected = estimatePostFixedCdb({
      officialValue: "1000",
      cdiPercentage: "100",
      rates: [{ annualRate: "14.9" }, { annualRate: "14.9" }],
    });

    expect(repository.cacheRates).toHaveBeenCalledWith([
      { date: "2026-09-17", annualRate: "14.9" },
    ]);
    expect(result.estimatedValueCents).toBe(expected.estimatedValueCents);
    expect(result.estimatedValueCents).not.toBe("100000");
  });

  it("fixes the valuation date in Sao Paulo across the UTC date boundary", async () => {
    vi.setSystemTime(new Date("2026-09-20T01:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-18", annualRate: "14.9" },
    ]);

    await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-18" },
    ]);

    expect(repository.listRatesFrom).toHaveBeenCalledWith(
      "2026-09-18",
      "2026-09-19",
    );
    expect(bcb.fetchRates).not.toHaveBeenCalled();
  });

  it("falls back to the imported value when one CDI weekday is missing and BCB fails", async () => {
    vi.setSystemTime(new Date("2026-09-23T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-21", annualRate: "14.9" },
    ]);
    bcb.fetchRates.mockRejectedValue(new Error("BCB unavailable"));

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-21" },
    ]);

    expect(result).toMatchObject({
      totalValue: "1000",
      cdbEstimateStatus: "unavailable",
      cdiPercentage: "100",
      estimatedValue: null,
      estimatedValueCents: null,
    });
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
      { ...cdb, referenceDate: "2026-09-21" },
    ]);

    expect(result).toMatchObject({
      cdbEstimateStatus: "unavailable",
      estimatedValue: null,
      estimatedValueCents: null,
    });
  });
  it("does not use a preceding quote as a provisional substitute for an absent date", async () => {
    vi.setSystemTime(new Date("2026-09-19T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-17", annualRate: "13.65" },
    ]);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-18" },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-18", "2026-09-19");
    expect(result).toMatchObject({
      totalValue: "1000",
      estimatedValue: null,
      estimatedValueCents: null,
      cdbEstimateStatus: "unavailable",
    });
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
        referenceDate: "2026-09-17",
      },
    ]);

    expect(bcb.fetchRates).toHaveBeenCalledTimes(1);
    expect(bcb.fetchRates).toHaveBeenCalledWith("2026-09-16", "2026-09-20");
    expect(repository.cacheRates).toHaveBeenCalledTimes(1);
  });

  it("sorts cached CDI rates before deciding whether a refresh is required", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-16", annualRate: "14.9" },
      { rateDate: "2026-09-17", annualRate: "14.9" },
      { rateDate: "2026-09-18", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([cdb]);

    expect(bcb.fetchRates).not.toHaveBeenCalled();
    expect(result.estimatedValue).toBe(
      estimatePostFixedCdb({
        officialValue: "1000",
        cdiPercentage: "100",
        rates: [
          { annualRate: "14.9" },
          { annualRate: "14.9" },
          { annualRate: "14.9" },
        ],
      }).estimatedValue,
    );
  });

  it("does not treat a missing Brazilian market holiday as an absent CDI rate", async () => {
    vi.setSystemTime(new Date("2026-09-08T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([
      { rateDate: "2026-09-04", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-04" },
    ]);

    expect(bcb.fetchRates).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      estimatedValue: expect.any(Number),
      estimatedValueCents: expect.any(String),
      cdbEstimateStatus: "official",
    });
  });
});

describe("CdbEstimateService dependency failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("returns positions without an estimate when configuration lookup fails", async () => {
    repository.listConfigurations.mockRejectedValue(
      new Error("db unavailable"),
    );

    await expect(new CdbEstimateService().enrich([cdb])).resolves.toEqual([
      {
        ...cdb,
        cdiPercentage: null,
        estimatedValue: null,
        estimatedValueCents: null,
      },
    ]);
    expect(repository.listRatesFrom).not.toHaveBeenCalled();
  });

  it("keeps the configured percentage when cached rate lookup fails", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "105" },
    ]);
    repository.listRatesFrom.mockRejectedValue(new Error("db unavailable"));

    const [result] = await new CdbEstimateService().enrich([cdb]);

    expect(result).toMatchObject({
      cdiPercentage: "105",
      estimatedValue: null,
    });
    expect(result).not.toHaveProperty("cdbEstimateStatus");
  });

  it("uses only persisted rates when caching fetched CDI data fails", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-16", annualRate: "14.9" },
      { date: "2026-09-17", annualRate: "14.9" },
      { date: "2026-09-18", annualRate: "14.9" },
    ]);
    repository.cacheRates.mockRejectedValue(new Error("db unavailable"));

    const [result] = await new CdbEstimateService().enrich([cdb]);

    expect(result).toMatchObject({
      totalValue: "1000",
      estimatedValue: null,
      estimatedValueCents: null,
      cdbEstimateStatus: "unavailable",
    });
  });

  it("falls back to the imported value when canonical rates cannot be reread", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("db unavailable"));
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-16", annualRate: "14.9" },
      { date: "2026-09-17", annualRate: "14.9" },
      { date: "2026-09-18", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([cdb]);

    expect(repository.cacheRates).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      totalValue: "1000",
      estimatedValue: null,
      estimatedValueCents: null,
    });
  });

  it("does not fabricate a CDI rate for a weekend reference date", async () => {
    vi.setSystemTime(new Date("2026-09-21T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-20" },
    ]);

    expect(bcb.fetchRates).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      totalValue: "1000",
      estimatedValue: 1000,
      estimatedValueCents: "100000",
      cdbEstimateStatus: "official",
    });
  });
});

it("returns unavailable when the estimator throws", async () => {
  vi.setSystemTime(new Date("2026-09-18T15:00:00Z"));
  repository.listConfigurations.mockResolvedValue([
    { assetCode: "CDB1", cdiPercentage: "100" },
  ]);
  repository.listRatesFrom.mockResolvedValue([
    { rateDate: "2026-09-16", annualRate: "14.9" },
    { rateDate: "2026-09-17", annualRate: "14.9" },
  ]);
  const estimatorModule = await import("@/backend/services/cdb-cdi-estimator");
  const estimate = vi
    .spyOn(estimatorModule, "estimatePostFixedCdb")
    .mockImplementation(() => {
      throw new Error("invalid estimate");
    });

  const [result] = await new CdbEstimateService().enrich([
    { ...cdb, referenceDate: "2026-09-16" },
  ]);

  expect(result).toMatchObject({
    estimatedValue: null,
    cdbEstimateStatus: "unavailable",
  });
  estimate.mockRestore();
});

describe("CdbEstimateService defensive branches", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T15:00:00Z"));
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a null percentage for positions without asset codes after rate lookup fails", async () => {
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockRejectedValue(new Error("db unavailable"));
    const withoutCode = {
      product: "Tesouro",
      assetCode: null,
      indexer: null,
      totalValue: "500",
      referenceDate: null,
    };

    const results = await new CdbEstimateService().enrich([
      cdb,
      { ...cdb, assetCode: "CDB2" },
      withoutCode,
    ]);

    expect(results[1]).toMatchObject({
      cdiPercentage: null,
      estimatedValue: null,
    });
    expect(results[2]).toMatchObject({
      cdiPercentage: null,
      estimatedValue: null,
    });
  });

  it("marks estimates unavailable when multiple weekdays remain after fetched rates", async () => {
    vi.setSystemTime(new Date("2026-09-24T15:00:00Z"));
    repository.listConfigurations.mockResolvedValue([
      { assetCode: "CDB1", cdiPercentage: "100" },
    ]);
    repository.listRatesFrom.mockResolvedValue([]);
    bcb.fetchRates.mockResolvedValue([
      { date: "2026-09-21", annualRate: "14.9" },
    ]);

    const [result] = await new CdbEstimateService().enrich([
      { ...cdb, referenceDate: "2026-09-21" },
    ]);

    expect(result).toMatchObject({
      cdbEstimateStatus: "unavailable",
      estimatedValue: null,
    });
  });
});
