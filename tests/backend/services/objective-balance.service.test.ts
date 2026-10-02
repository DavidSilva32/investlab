import { describe, expect, it, vi } from "vitest";
import { bcbCdiService } from "@/backend/services/bcb-cdi.service";
import {
  ObjectiveBalanceService,
  type ObjectiveBalanceReference,
} from "@/backend/services/objective-balance.service";

const reference = (
  overrides: Partial<ObjectiveBalanceReference> = {},
): ObjectiveBalanceReference => ({
  objectiveId: "22222222-2222-4222-8222-222222222222",
  amountCents: "10000",
  observedDate: "2026-10-01",
  cdiPercentage: "100.0000",
  ...overrides,
});

function createService(options?: {
  rates?: Array<{ rateDate: string; annualRate: string; fetchedAt: Date }>;
  fetched?: Array<{ date: string; annualRate: string }>;
}) {
  const persisted = [...(options?.rates ?? [])];
  const rates = {
    listRatesFrom: vi.fn(async (from: string, to: string) =>
      persisted.filter((rate) => rate.rateDate > from && rate.rateDate < to),
    ),
    listLatestRateOnOrBefore: vi.fn(
      async (date: string) =>
        persisted
          .filter((rate) => rate.rateDate <= date)
          .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0] ?? null,
    ),
    cacheRates: vi.fn(
      async (items: Array<{ date: string; annualRate: string }>) => {
        for (const item of items) {
          if (!persisted.some((rate) => rate.rateDate === item.date)) {
            persisted.push({
              ...item,
              rateDate: item.date,
              fetchedAt: new Date("2026-10-06T12:00:00Z"),
            });
          }
        }
      },
    ),
  };
  const fetchOfficialRates = vi.fn(async () => options?.fetched ?? []);
  const repository = {
    saveObservedBalance: vi.fn(async (input) => ({
      ...input,
      id: "balance-1",
    })),
  };
  const service = new ObjectiveBalanceService(
    repository as never,
    rates as never,
    fetchOfficialRates,
    () => "2026-10-06",
  );
  return { service, rates, repository, fetchOfficialRates, persisted };
}

describe("ObjectiveBalanceService", () => {
  it("saves canonical cents and appends each observed balance", async () => {
    const { service, repository } = createService();
    const first = await service.save({
      objectiveId: reference().objectiveId,
      amount: "1.005",
      observedOn: "2026-10-01",
      cdiPercentage: "100",
    });
    await service.save({
      objectiveId: reference().objectiveId,
      amount: "10.20",
      observedOn: "2026-10-02",
    });
    expect(first).toMatchObject({
      amountCents: "101",
      observedOn: "2026-10-01",
    });
    expect(repository.saveObservedBalance).toHaveBeenNthCalledWith(2, {
      objectiveId: reference().objectiveId,
      amountCents: "1020",
      observedOn: "2026-10-02",
      cdiPercentage: null,
    });
  });

  it("rejects invalid observed amounts before writing history", async () => {
    const { service, repository } = createService();
    await expect(
      service.save({
        objectiveId: reference().objectiveId,
        amount: "-1.00",
        observedOn: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveObservedBalance).not.toHaveBeenCalled();
  });

  it("returns not found when the objective disappears before saving", async () => {
    const { service, repository } = createService();
    repository.saveObservedBalance.mockResolvedValueOnce(null);

    await expect(
      service.save({
        objectiveId: reference().objectiveId,
        amount: "50.00",
        observedOn: "2026-10-01",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("does not project balances saved without explicit CDI conditions", async () => {
    const { service, fetchOfficialRates } = createService();
    const result = await service.projectLatest([
      reference({ cdiPercentage: null }),
    ]);
    expect(result.get(reference().objectiveId)).toEqual({
      projection: null,
      unavailableReason: "missing_conditions",
    });
    expect(fetchOfficialRates).not.toHaveBeenCalled();
  });

  it("keeps an observation dated after evaluation out of projections", async () => {
    const { service, fetchOfficialRates } = createService();
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-07" })],
      "2026-10-06",
    );
    expect(result.get(reference().objectiveId)).toEqual({
      projection: null,
      unavailableReason: "no_eligible_days",
    });
    expect(fetchOfficialRates).not.toHaveBeenCalled();
  });

  it("revalidates missing weekdays, persists only returned official CDI, then uses the official revision", async () => {
    const options = {
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
      fetched: [{ date: "2026-10-05", annualRate: "20" }],
    };
    const { service, rates, fetchOfficialRates, persisted } =
      createService(options);
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-01" })],
      "2026-10-05",
    );
    expect(fetchOfficialRates).toHaveBeenCalledWith("2026-10-05", "2026-10-05");
    expect(rates.cacheRates).toHaveBeenCalledWith([
      { date: "2026-10-05", annualRate: "20" },
    ]);
    expect(persisted.map((rate) => rate.annualRate)).toEqual(["10", "20"]);
    expect(result.get(reference().objectiveId)?.projection).toMatchObject({
      projectedOn: "2026-10-05",
      estimatedThrough: "2026-10-05",
      status: "projected",
    });
    expect(
      BigInt(
        result.get(reference().objectiveId)!.projection!.projectedAmountCents,
      ),
    ).toBeGreaterThan(10000n);
  });

  it("uses a complete persisted official series without refetching", async () => {
    const { service, fetchOfficialRates } = createService({
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
    });
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-01" })],
      "2026-10-02",
    );
    expect(fetchOfficialRates).not.toHaveBeenCalled();
    expect(result.get(reference().objectiveId)).toMatchObject({
      unavailableReason: null,
      projection: { status: "projected", estimatedThrough: "2026-10-02" },
    });
  });

  it("uses a deterministic provisional series on weekday gaps and is repeatable", async () => {
    const { service, fetchOfficialRates } = createService({
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
    });
    const input = [reference({ observedDate: "2026-10-01" })];
    const first = await service.projectLatest(input);
    const second = await service.projectLatest(input);
    expect(first.get(reference().objectiveId)?.projection).toEqual(
      second.get(reference().objectiveId)?.projection,
    );
    expect(first.get(reference().objectiveId)?.projection?.status).toBe(
      "provisional",
    );
    expect(fetchOfficialRates).toHaveBeenCalledTimes(2);
  });

  it("replaces a prior weekday-gap assumption when the official CDI arrives", async () => {
    const { service, fetchOfficialRates } = createService({
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
    });
    const input = [reference({ observedDate: "2026-10-01" })];
    const provisional = await service.projectLatest(input, "2026-10-05");
    fetchOfficialRates.mockResolvedValue([
      { date: "2026-10-05", annualRate: "20" },
    ]);
    const recalculated = await service.projectLatest(input, "2026-10-05");

    expect(provisional.get(reference().objectiveId)?.projection?.status).toBe(
      "provisional",
    );
    expect(recalculated.get(reference().objectiveId)?.projection?.status).toBe(
      "projected",
    );
    expect(
      BigInt(
        recalculated.get(reference().objectiveId)!.projection!
          .projectedAmountCents,
      ),
    ).toBeGreaterThan(
      BigInt(
        provisional.get(reference().objectiveId)!.projection!
          .projectedAmountCents,
      ),
    );
  });

  it("does not emit an unchanged projection on a weekend or request CDI", async () => {
    const { service, fetchOfficialRates } = createService();
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-02" })],
      "2026-10-04",
    );
    expect(result.get(reference().objectiveId)).toMatchObject({
      projection: null,
      unavailableReason: "no_eligible_days",
    });
    expect(fetchOfficialRates).not.toHaveBeenCalled();
  });

  it("does not emit an unchanged projection on the observation date", async () => {
    const { service, fetchOfficialRates } = createService();
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-06" })],
      "2026-10-06",
    );
    expect(result.get(reference().objectiveId)).toMatchObject({
      projection: null,
      unavailableReason: "no_eligible_days",
    });
    expect(fetchOfficialRates).not.toHaveBeenCalled();
  });

  it("projects through the evaluation weekday using the latest official CDI", async () => {
    const { service, fetchOfficialRates } = createService({
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
    });
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-02" })],
      "2026-10-05",
    );
    expect(result.get(reference().objectiveId)?.projection).toMatchObject({
      projectedOn: "2026-10-05",
      estimatedThrough: "2026-10-05",
      status: "provisional",
    });
    expect(
      BigInt(
        result.get(reference().objectiveId)!.projection!.projectedAmountCents,
      ),
    ).toBeGreaterThan(10000n);
    expect(fetchOfficialRates).toHaveBeenCalledWith("2026-10-05", "2026-10-05");
  });

  it("bootstraps a prior official rate from ten days before a cold observation", async () => {
    const { service, rates, fetchOfficialRates, persisted } = createService({
      fetched: [{ date: "2026-09-30", annualRate: "10" }],
    });
    const result = await service.projectLatest([
      reference({ observedDate: "2026-10-01" }),
    ]);
    expect(fetchOfficialRates).toHaveBeenCalledWith("2026-09-21", "2026-10-06");
    expect(rates.cacheRates).toHaveBeenCalledWith([
      { date: "2026-09-30", annualRate: "10" },
    ]);
    expect(persisted.map((rate) => rate.rateDate)).toEqual(["2026-09-30"]);
    expect(result.get(reference().objectiveId)?.projection).toMatchObject({
      estimatedThrough: "2026-10-06",
      status: "provisional",
    });
  });

  it("keeps the observation only when no official rate can be recovered", async () => {
    const { service } = createService();
    const result = await service.projectLatest([
      reference({ observedDate: "2026-10-01" }),
    ]);
    expect(result.get(reference().objectiveId)).toMatchObject({
      projection: null,
      unavailableReason: "rates_unavailable",
    });
  });

  it("keeps a provisional cached estimate when the official fetch fails", async () => {
    const { service, fetchOfficialRates } = createService({
      rates: [
        {
          rateDate: "2026-10-02",
          annualRate: "10",
          fetchedAt: new Date("2026-10-02"),
        },
      ],
    });
    fetchOfficialRates.mockRejectedValue(new Error("BCB unavailable"));

    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-01" })],
      "2026-10-05",
    );

    expect(result.get(reference().objectiveId)?.projection).toMatchObject({
      status: "provisional",
      estimatedThrough: "2026-10-05",
    });
  });

  it("keeps the observed-only reference when CDI reads fail", async () => {
    const repository = { saveObservedBalance: vi.fn() };
    const rates = {
      listRatesFrom: vi.fn().mockRejectedValue(new Error("db unavailable")),
      listLatestRateOnOrBefore: vi.fn(),
      cacheRates: vi.fn(),
    };
    const service = new ObjectiveBalanceService(
      repository as never,
      rates as never,
      vi.fn(async () => []),
      () => "2026-10-06",
    );
    const result = await service.projectLatest([reference()]);
    expect(result.get(reference().objectiveId)).toEqual({
      projection: null,
      unavailableReason: "rates_unavailable",
    });
  });

  it("uses the default BCB dependency when an eligible official date is missing", async () => {
    const { rates } = createService();
    const fetchRates = vi
      .spyOn(bcbCdiService, "fetchRates")
      .mockResolvedValue([{ date: "2026-10-02", annualRate: "10" }]);
    try {
      const service = new ObjectiveBalanceService(
        { saveObservedBalance: vi.fn() } as never,
        rates as never,
        undefined,
        () => "2026-10-06",
      );
      const result = await service.projectLatest([
        reference({ observedDate: "2026-10-01" }),
      ]);
      expect(fetchRates).toHaveBeenCalledWith("2026-09-21", "2026-10-06");
      expect(result.get(reference().objectiveId)?.projection?.status).toBe(
        "provisional",
      );
    } finally {
      fetchRates.mockRestore();
    }
  });

  it("ignores BCB rows after the evaluation date", async () => {
    const { service, rates, persisted } = createService({
      fetched: [{ date: "2026-10-07", annualRate: "99" }],
    });
    const result = await service.projectLatest(
      [reference({ observedDate: "2026-10-01" })],
      "2026-10-06",
    );
    expect(result.get(reference().objectiveId)).toMatchObject({
      projection: null,
      unavailableReason: "rates_unavailable",
    });
    expect(rates.cacheRates).not.toHaveBeenCalled();
    expect(persisted).toEqual([]);
  });

  it("chooses the earliest missing CDI date across observation dates", async () => {
    const { service, fetchOfficialRates } = createService();
    await service.projectLatest(
      [
        reference({
          objectiveId: "22222222-2222-4222-8222-222222222222",
          observedDate: "2026-10-01",
        }),
        reference({
          objectiveId: "33333333-3333-4333-8333-333333333333",
          observedDate: "2026-10-03",
        }),
      ],
      "2026-10-06",
    );
    expect(fetchOfficialRates).toHaveBeenCalledWith("2026-09-21", "2026-10-06");
  });
});
