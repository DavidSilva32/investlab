import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  getDatabaseClient: vi.fn(),
  query: {
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
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: database.getDatabaseClient,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: database.logger }));

import { ManualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import {
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
    database.query.orderBy.mockResolvedValue([row]);
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
    expect(database.query.values).toHaveBeenNthCalledWith(1, row);
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

  it("creates a position and its selected asset class in one transaction", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(
      repository.create({ ...row }, "req", {
        assetClass: "Fundos",
        subClass: "ETF de ações",
        geography: "Exterior",
      }),
    ).resolves.toEqual(row);
    expect(database.query.transaction).toHaveBeenCalledOnce();
    expect(database.query.insert).toHaveBeenCalledTimes(3);
    expect(database.query.values).toHaveBeenLastCalledWith({
      assetKey: row.assetKey,
      assetClass: "Fundos",
      subClass: "ETF de ações",
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

  it("updates the position and its selected asset class in one transaction", async () => {
    const repository = new ManualPortfolioPositionRepository();
    await expect(
      repository.update(id, { ...row }, "req", {
        assetClass: "Fundos",
        subClass: "ETF de ações",
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
      assetClass: "Fundos",
      subClass: "ETF de ações",
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
        subClass: "ETF de ações",
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
