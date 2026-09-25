import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => db,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
import { PortfolioClassificationRepository } from "@/backend/repositories/portfolio-classification.repository";

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
        {
          assetKey: "key-1",
          assetClass: "Fundos",
          subClass: "FII",
          geography: "Brasil",
        },
        "req-3",
      ),
    ).resolves.toBe(row);
    expect(values).toHaveBeenCalledWith({
      assetKey: "key-1",
      assetClass: "Fundos",
      subClass: "FII",
      geography: "Brasil",
    });
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
});
