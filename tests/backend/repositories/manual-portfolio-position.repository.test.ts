import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  getDatabaseClient: vi.fn(),
  query: {
    execute: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    returning: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    onConflictDoNothing: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    delete: vi.fn(),
  },
  logger: { error: vi.fn() },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: database.getDatabaseClient,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: database.logger }));

import { ManualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import {
  manualPortfolioAdjustmentEvents,
  manualPortfolioPositionSnapshots,
  manualPortfolioPositions,
} from "@/infrastructure/database/schema";

const id = "0fefb48f-b6d9-4b8e-890d-95fe4fe7b305";
const row = {
  id,
  assetKey: "manual:" + id,
  product: "ETF",
  assetCode: "VT",
  institution: null,
  quantity: "2",
  currency: "USD",
  unitPrice: "10",
  totalValue: "20",
  valueBasis: "unit_price",
  informationalCdiPercentage: null,
  positionDate: "2026-09-20",
  convertedValueBrl: null,
  conversionDate: null,
  createdAt: new Date("2026-09-20T12:00:00.000Z"),
  updatedAt: new Date("2026-09-20T12:00:00.000Z"),
};

describe("ManualPortfolioPositionRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.getDatabaseClient.mockReturnValue(database.query);
    database.query.select.mockReturnValue(database.query);
    database.query.from.mockReturnValue(database.query);
    database.query.orderBy.mockReturnValue(
      Object.assign(Promise.resolve([row]), { limit: database.query.limit }),
    );
    database.query.limit.mockResolvedValue([row]);
    database.query.insert.mockReturnValue(database.query);
    database.query.values.mockReturnValue(database.query);
    database.query.update.mockReturnValue(database.query);
    database.query.set.mockReturnValue(database.query);
    database.query.where.mockReturnValue(database.query);
    database.query.for.mockReturnValue(database.query);
    database.query.delete.mockReturnValue(database.query);
    database.query.returning.mockImplementation((selection) =>
      Promise.resolve(selection ? [{ id }] : [row]),
    );
    database.query.onConflictDoUpdate.mockReturnValue(database.query);
    database.query.onConflictDoNothing.mockReturnValue(database.query);
    database.query.transaction.mockImplementation((callback) =>
      callback(database.query),
    );
  });

  it("scopes position reads to the authenticated owner", async () => {
    const where = vi.fn().mockReturnValue({
      orderBy: async () => [row],
    });
    database.query.from.mockReturnValue({ where });
    await expect(
      new ManualPortfolioPositionRepository().list(),
    ).resolves.toEqual([row]);
    expect(where.mock.calls[0]?.[0].queryChunks).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "owner-1" })]),
    );
  });

  it("lists positions in the repository-defined order", async () => {
    await expect(
      new ManualPortfolioPositionRepository().list("req"),
    ).resolves.toEqual([row]);
    expect(database.query.from).toHaveBeenCalledWith(manualPortfolioPositions);
    expect(database.query.orderBy).toHaveBeenCalledWith(
      manualPortfolioPositions.product,
      expect.anything(),
    );
  });

  it("lists immutable manual value observations in recorded order", async () => {
    await expect(
      new ManualPortfolioPositionRepository().listSnapshots("req"),
    ).resolves.toEqual([row]);
    expect(database.query.from).toHaveBeenCalledWith(
      manualPortfolioPositionSnapshots,
    );
    expect(database.query.orderBy).toHaveBeenCalledWith(
      manualPortfolioPositionSnapshots.recordedAt,
      manualPortfolioPositionSnapshots.assetKey,
    );
  });

  it("creates a position and returns the inserted row", async () => {
    await expect(
      new ManualPortfolioPositionRepository().create({ ...row }, "req"),
    ).resolves.toEqual(row);
    expect(database.query.values).toHaveBeenNthCalledWith(1, {
      ...row,
      userId: "owner-1",
    });
    expect(database.query.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        assetKey: row.assetKey,
        totalValue: row.totalValue,
        status: "ACTIVE",
        recordedAt: row.createdAt,
      }),
    );
  });

  it("persists and lists the informational CDB CDI percentage with the position", async () => {
    const position = { ...row, informationalCdiPercentage: "100.0000" };
    database.query.orderBy.mockReturnValueOnce(
      Object.assign(Promise.resolve([position]), {
        limit: database.query.limit,
      }),
    );
    await new ManualPortfolioPositionRepository().create(position, "req");
    expect(database.query.values).toHaveBeenNthCalledWith(1, {
      ...position,
      userId: "owner-1",
    });

    await expect(
      new ManualPortfolioPositionRepository().list("req"),
    ).resolves.toEqual([position]);
  });

  it.each([
    ["with a request id", "req"],
    ["without a request id", undefined],
  ])(
    "records a neutral adjustment with previous and new quantity and price $0",
    async (_description, requestId) => {
      const updatedAt = new Date("2026-09-21T12:00:00.000Z");
      const updated = {
        ...row,
        quantity: "3",
        unitPrice: "12",
        totalValue: "36",
        updatedAt,
      };
      database.query.orderBy.mockResolvedValueOnce([]);
      database.query.returning.mockResolvedValueOnce([updated]);

      await new ManualPortfolioPositionRepository().update(
        id,
        {
          quantity: "3",
          unitPrice: "12",
          totalValue: "36",
          currency: row.currency,
          valueBasis: row.valueBasis,
          positionDate: row.positionDate,
          convertedValueBrl: row.convertedValueBrl,
          conversionDate: row.conversionDate,
          product: row.product,
          assetCode: row.assetCode,
          institution: row.institution,
        },
        requestId,
      );

      expect(database.query.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "NEUTRAL_ADJUSTMENT",
          assetKey: row.assetKey,
          previousQuantity: row.quantity,
          quantity: "3",
          previousUnitPrice: row.unitPrice,
          unitPrice: "12",
          previousTotalValue: row.totalValue,
          totalValue: "36",
          requestId: requestId ?? null,
        }),
      );
      expect(database.query.insert).toHaveBeenCalledWith(
        manualPortfolioPositionSnapshots,
      );
      expect(database.query.transaction).toHaveBeenCalledOnce();
    },
  );

  it("does not label registration, date, or classification edits as adjustments", async () => {
    const updated = {
      ...row,
      product: "ETF ajustado",
      positionDate: "2026-09-21",
    };
    database.query.orderBy.mockResolvedValueOnce([]);
    database.query.returning.mockResolvedValueOnce([updated]);

    await new ManualPortfolioPositionRepository().update(
      id,
      {
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalValue: row.totalValue,
        currency: row.currency,
        valueBasis: row.valueBasis,
        positionDate: "2026-09-21",
        convertedValueBrl: row.convertedValueBrl,
        conversionDate: row.conversionDate,
        product: "ETF ajustado",
        assetCode: row.assetCode,
        institution: row.institution,
      },
      "req",
      {
        assetClass: "Fundos",
        subClass: "Exterior ETF",
        geography: "Exterior",
      },
    );

    expect(database.query.insert).toHaveBeenCalledTimes(3);
    expect(database.query.values).toHaveBeenLastCalledWith(
      expect.objectContaining({
        assetClass: "Fundos",
        subClass: "Exterior ETF",
      }),
    );
  });

  it("does not create a second adjustment when the same patch is retried", async () => {
    let currentPosition = { ...row };
    database.query.limit.mockImplementation(async () => [currentPosition]);
    database.query.orderBy.mockResolvedValue([]);
    database.query.set.mockImplementation((values) => {
      currentPosition = { ...currentPosition, ...values };
      return database.query;
    });
    database.query.returning.mockImplementation((selection) =>
      Promise.resolve(selection ? [{ id }] : [currentPosition]),
    );

    const input = {
      quantity: "3",
      unitPrice: "12",
      totalValue: "36",
      currency: row.currency,
      valueBasis: row.valueBasis,
      positionDate: row.positionDate,
      convertedValueBrl: row.convertedValueBrl,
      conversionDate: row.conversionDate,
      product: row.product,
      assetCode: row.assetCode,
      institution: row.institution,
    };
    const repository = new ManualPortfolioPositionRepository();

    await repository.update(id, input, "req");
    await repository.update(id, input, "req");

    const adjustmentWrites = database.query.values.mock.calls.filter(
      ([value]) => value.eventType === "NEUTRAL_ADJUSTMENT",
    );
    expect(adjustmentWrites).toHaveLength(1);
  });

  it("rejects the update when its adjustment event cannot be saved", async () => {
    const failure = new Error("adjustment event insert failed");
    database.query.orderBy.mockResolvedValueOnce([]);
    database.query.insert.mockImplementation((table) => {
      if (table === manualPortfolioAdjustmentEvents) {
        return {
          values: vi.fn().mockRejectedValue(failure),
        };
      }
      return database.query;
    });

    await expect(
      new ManualPortfolioPositionRepository().update(
        id,
        {
          quantity: "3",
          unitPrice: "12",
          totalValue: "36",
          currency: row.currency,
          valueBasis: row.valueBasis,
          positionDate: row.positionDate,
          convertedValueBrl: row.convertedValueBrl,
          conversionDate: row.conversionDate,
          product: row.product,
          assetCode: row.assetCode,
          institution: row.institution,
        },
        "req",
      ),
    ).rejects.toBe(failure);
    expect(database.query.transaction).toHaveBeenCalledOnce();
    expect(database.query.update).toHaveBeenCalledOnce();
    expect(database.query.insert).toHaveBeenCalledWith(
      manualPortfolioAdjustmentEvents,
    );
  });

  it.each([
    ["unit price", { unitPrice: "12" }],
    ["currency", { currency: "EUR" }],
    ["converted value", { convertedValueBrl: "30" }],
  ])("records an adjustment when the %s changes", async (_label, change) => {
    const updated = { ...row, ...change, updatedAt: new Date() };
    database.query.orderBy.mockResolvedValueOnce([]);
    database.query.returning.mockResolvedValueOnce([updated]);

    await new ManualPortfolioPositionRepository().update(
      id,
      { ...row, ...change },
      "req",
    );

    expect(database.query.insert).toHaveBeenCalledWith(
      manualPortfolioAdjustmentEvents,
    );
  });

  it("creates a position and its selected asset class in one transaction", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(
      repository.create({ ...row }, "req", {
        assetClass: "Fundos",
        subClass: "ETF de aÃ§Ãµes",
        geography: "Exterior",
      }),
    ).resolves.toEqual(row);
    expect(database.query.transaction).toHaveBeenCalledOnce();
    expect(database.query.insert).toHaveBeenCalledTimes(3);
    expect(database.query.values).toHaveBeenLastCalledWith({
      assetKey: row.assetKey,
      userId: "owner-1",
      assetClass: "Fundos",
      subClass: "ETF de aÃ§Ãµes",
      geography: "Exterior",
    });
    expect(database.query.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          assetClass: expect.anything(),
          subClass: expect.anything(),
          geography: expect.anything(),
        }),
      }),
    );
  });

  it.each(["assetCode", "institution", "currency", "product"] as const)(
    "requires reversal before editing linked %s",
    async (field) => {
      database.query.orderBy.mockResolvedValueOnce([
        {
          id: "event",
          manualAssetKey: row.assetKey,
          importedAssetKey: "b3",
          effectiveFrom: "2026-09-01",
          recordedAt: new Date("2026-09-01"),
          status: "LINK",
        },
      ]);
      await expect(
        new ManualPortfolioPositionRepository().update(
          id,
          { ...row, [field]: "changed" },
          "req",
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(database.query.update).not.toHaveBeenCalled();
      expect(database.query.execute).toHaveBeenCalledOnce();
    },
  );
  it("permits value edits without reviving a reconciled manual position", async () => {
    database.query.orderBy.mockResolvedValueOnce([
      {
        id: "event",
        manualAssetKey: row.assetKey,
        importedAssetKey: "b3",
        effectiveFrom: "2026-09-01",
        recordedAt: new Date("2026-09-01"),
        status: "LINK",
      },
    ]);
    await expect(
      new ManualPortfolioPositionRepository().update(
        id,
        { ...row, totalValue: "30" },
        "req",
      ),
    ).resolves.toEqual(row);
    expect(database.query.update).toHaveBeenCalledOnce();
  });
  it("permits editing a manual position without any reconciliation history", async () => {
    database.query.orderBy.mockResolvedValueOnce([]);
    await expect(
      new ManualPortfolioPositionRepository().update(id, { ...row }, "req"),
    ).resolves.toEqual(row);
  });
  it("updates the position and its selected asset class in one transaction", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(
      repository.update(id, { ...row }, "req", {
        assetClass: "Fundos",
        subClass: "ETF de aÃ§Ãµes",
        geography: "Exterior",
      }),
    ).resolves.toEqual(row);
    expect(database.query.transaction).toHaveBeenCalledOnce();
    expect(database.query.update).toHaveBeenCalledOnce();
    expect(database.query.insert).toHaveBeenCalledTimes(3);
    expect(database.query.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "ACTIVE", totalValue: row.totalValue }),
    );
    expect(database.query.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "ACTIVE", totalValue: row.totalValue }),
    );
    expect(database.query.values).toHaveBeenLastCalledWith({
      assetKey: row.assetKey,
      userId: "owner-1",
      assetClass: "Fundos",
      subClass: "ETF de aÃ§Ãµes",
      geography: "Exterior",
    });
    expect(database.query.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          assetClass: expect.anything(),
          subClass: expect.anything(),
          geography: expect.anything(),
        }),
      }),
    );
  });

  it("does not write a classification when the position no longer exists", async () => {
    database.query.limit.mockResolvedValueOnce([]);
    await expect(
      new ManualPortfolioPositionRepository().update(id, { ...row }, "req", {
        assetClass: "Fundos",
        subClass: "ETF de aÃ§Ãµes",
        geography: "Exterior",
      }),
    ).resolves.toBeNull();
    expect(database.query.insert).not.toHaveBeenCalled();
  });

  it("updates a position and reports a missing row as null", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(repository.update(id, { ...row }, "req")).resolves.toEqual(
      row,
    );
    expect(database.query.where).toHaveBeenCalled();
    database.query.returning.mockResolvedValueOnce([]);
    await expect(repository.update(id, { ...row })).resolves.toBeNull();
  });

  it("deletes a position and reports a missing row as null", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(repository.delete(id, "req")).resolves.toEqual({ id });
    expect(database.query.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "ACTIVE" }),
    );
    expect(database.query.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "DELETED" }),
    );
    database.query.returning.mockResolvedValueOnce([]);
    await expect(repository.delete(id)).resolves.toBeNull();
    database.query.limit.mockResolvedValueOnce([]);
    await expect(repository.delete(id)).resolves.toBeNull();
  });

  it.each(["list", "snapshots", "create", "update", "delete"] as const)(
    "logs and rethrows database errors from %s",
    async (operation) => {
      const failure = new Error("database unavailable");
      if (operation === "list" || operation === "snapshots")
        database.query.orderBy.mockRejectedValueOnce(failure);
      else database.query.returning.mockRejectedValueOnce(failure);
      const repository = new ManualPortfolioPositionRepository();
      const input = { ...row };
      const call =
        operation === "list"
          ? repository.list("req")
          : operation === "snapshots"
            ? repository.listSnapshots("req")
            : operation === "create"
              ? repository.create(input, "req")
              : operation === "update"
                ? repository.update(id, input, "req")
                : repository.delete(id, "req");
      await expect(call).rejects.toBe(failure);
      expect(database.logger.error).toHaveBeenCalledWith(
        expect.stringContaining("manual_portfolio_position"),
        expect.objectContaining({ requestId: "req", error: failure }),
      );
    },
  );
});
