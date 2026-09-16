import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { select: vi.fn(), transaction: vi.fn() },
  logger: { error: vi.fn() },
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => mocks.client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { importRepository } from "@/backend/repositories/import.repository";

const positions = [{ product: "Ativo", quantity: "1" }] as never;
const chain = (result: unknown) => ({
  from: () => ({
    where: () => ({ limit: async () => result, orderBy: async () => result }),
    orderBy: () => ({ limit: async () => result }),
  }),
});

describe("import repository", () => {
  beforeEach(() => vi.clearAllMocks());
  it("checks import hash presence", async () => {
    mocks.client.select
      .mockReturnValueOnce(chain([{ id: "import-1" }]))
      .mockReturnValueOnce(chain([]));
    await expect(importRepository.existsByHash("hash")).resolves.toBe(true);
    await expect(importRepository.existsByHash("hash")).resolves.toBe(false);
  });
  it("logs database failures", async () => {
    mocks.client.select.mockImplementation(() => {
      throw new Error("db");
    });
    await expect(
      importRepository.existsByHash("hash", "request-1"),
    ).rejects.toThrow("db");
    expect(mocks.logger.error).toHaveBeenCalled();
  });
  it("creates import, snapshot and position items in one transaction", async () => {
    const transaction = { insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-1" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({
          returning: async () => [{ id: "snapshot-1", importId: "import-1" }],
        }),
      })
      .mockReturnValueOnce({ values: async () => undefined });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.create({
        fileName: "b3.xlsx",
        fileHash: "hash",
        positions,
      }),
    ).resolves.toMatchObject({ id: "snapshot-1" });
  });
  it("returns an empty list without snapshots", async () => {
    mocks.client.select.mockReturnValue(chain([]));
    await expect(importRepository.listLatestPositions()).resolves.toEqual([]);
  });
  it("logs persistence failures", async () => {
    mocks.client.transaction.mockRejectedValue(new Error("write failed"));
    await expect(
      importRepository.create({
        fileName: "b3.xlsx",
        fileHash: "hash",
        positions,
      }),
    ).rejects.toThrow("write failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_import_persistence_failed",
      expect.any(Object),
    );
  });

  it("returns the position items from the latest snapshot", async () => {
    mocks.client.select
      .mockReturnValueOnce(chain([{ id: "snapshot-1" }]))
      .mockReturnValueOnce(chain([{ product: "Ativo", quantity: "1" }]));
    await expect(importRepository.listLatestPositions()).resolves.toEqual([
      { product: "Ativo", quantity: "1" },
    ]);
  });

  it("logs failures while loading positions", async () => {
    mocks.client.select.mockImplementation(() => {
      throw new Error("read failed");
    });
    await expect(
      importRepository.listLatestPositions("request-1"),
    ).rejects.toThrow("read failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_positions_query_failed",
      expect.any(Object),
    );
  });
});
