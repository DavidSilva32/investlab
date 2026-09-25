import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  transaction: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => db,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { PortfolioClassificationRepository } from "@/backend/repositories/portfolio-classification.repository";

const record = (assetKey: string) => ({
  assetKey,
  assetClass: "Fundos",
  subClass: "FII",
  geography: "Brasil",
});

describe("PortfolioClassificationRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips a query when there are no current asset keys", async () => {
    await expect(
      new PortfolioClassificationRepository().listByAssetKeys([]),
    ).resolves.toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("queries only requested asset keys", async () => {
    const rows = [{ assetKey: "key-1", assetClass: "Fundos" }];
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    db.select.mockReturnValue({ from });

    await expect(
      new PortfolioClassificationRepository().listByAssetKeys(
        ["key-1"],
        "req-1",
      ),
    ).resolves.toBe(rows);
    expect(where).toHaveBeenCalledOnce();
  });

  it("logs and rethrows classification lookup errors", async () => {
    const error = new Error("database failure");
    const where = vi.fn().mockRejectedValue(error);
    const from = vi.fn().mockReturnValue({ where });
    db.select.mockReturnValue({ from });

    await expect(
      new PortfolioClassificationRepository().listByAssetKeys(
        ["key-1"],
        "req-2",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_classifications_query_failed",
      { requestId: "req-2", error },
    );
  });

  it("upserts the classification under the stable key", async () => {
    const row = { assetKey: "key-1", assetClass: "Fundos" };
    const returning = vi.fn().mockResolvedValue([row]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    db.insert.mockReturnValue({ values });

    await expect(
      new PortfolioClassificationRepository().upsert(
        { ...record("key-1"), subClass: "FII" },
        "req-3",
      ),
    ).resolves.toBe(row);
    expect(values).toHaveBeenCalledWith(record("key-1"));
    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it("logs and rethrows classification update errors", async () => {
    const error = new Error("database failure");
    const returning = vi.fn().mockRejectedValue(error);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    db.insert.mockReturnValue({ values });

    await expect(
      new PortfolioClassificationRepository().upsert(
        {
          assetKey: "key-1",
          assetClass: null,
          subClass: null,
          geography: null,
        },
        "req-4",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_classification_update_failed",
      { requestId: "req-4", error },
    );
  });

  it("upserts each deduplicated classification in one transaction", async () => {
    const rows = [record("key-1"), record("key-2")];
    const returning = vi.fn().mockResolvedValue(rows);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const transaction = { insert: vi.fn().mockReturnValue({ values }) };
    db.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioClassificationRepository().upsertMany(
        [record("key-1"), record("key-1"), record("key-2")],
        "req-5",
      ),
    ).resolves.toBe(rows);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith([record("key-1"), record("key-2")]);
  });

  it("does not open a transaction for an empty batch", async () => {
    await expect(
      new PortfolioClassificationRepository().upsertMany([]),
    ).resolves.toEqual([]);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rolls back a failed batch and logs the failure", async () => {
    const error = new Error("database failure");
    const returning = vi.fn().mockRejectedValue(error);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const transaction = { insert: vi.fn().mockReturnValue({ values }) };
    db.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioClassificationRepository().upsertMany(
        [record("key-1")],
        "req-6",
      ),
    ).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "portfolio_classification_update_failed",
      { requestId: "req-6", error },
    );
  });
});
