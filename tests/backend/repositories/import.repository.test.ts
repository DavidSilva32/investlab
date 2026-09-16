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

const positions = [
  {
    product: "Ativo",
    quantity: "1",
    unitPrice: "0.01059225",
    totalValue: "3177.67",
    valuationSource: "CURVA",
    curveUnitPrice: "0.01059225",
    curveTotalValue: "3177.67",
  },
] as never;
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
    const persistItems = vi.fn().mockResolvedValue(undefined);
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
      .mockReturnValueOnce({ values: persistItems });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.create({
        fileName: "b3.xlsx",
        fileHash: "hash",
        positions,
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot-1" });
    expect(persistItems).toHaveBeenCalledWith([
      expect.objectContaining({
        snapshotId: "snapshot-1",
        valuationSource: "CURVA",
        curveUnitPrice: "0.01059225",
        curveTotalValue: "3177.67",
      }),
    ]);
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
  it("persists movement items without creating a position snapshot", async () => {
    const persistMovements = vi.fn().mockResolvedValue(undefined);
    const transaction = { insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-1" }] }),
      })
      .mockReturnValueOnce({ values: persistMovements });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.create({
        fileName: "movements.xlsx",
        fileHash: "movement-hash",
        documentType: "B3_MOVEMENT_XLSX",
        movements: [
          {
            direction: "CREDITO",
            occurredAt: "2026-09-11",
            movementType: "APLICAÇÃO",
            product: "CDB",
            assetCode: null,
            institution: null,
            quantity: "1",
            unitPrice: "0.01",
            operationValue: "0.01",
          },
        ],
      }),
    ).resolves.toEqual({ importId: "import-1" });
    expect(persistMovements).toHaveBeenCalledWith([
      expect.objectContaining({ importId: "import-1", direction: "CREDITO" }),
    ]);
  });

  it("lists movements and logs movement-query failures", async () => {
    mocks.client.select.mockReturnValue({
      from: () => ({ orderBy: async () => [{ id: "movement-1" }] }),
    });
    await expect(importRepository.listMovements()).resolves.toEqual([
      { id: "movement-1" },
    ]);
    mocks.client.select.mockImplementation(() => {
      throw new Error("movement read failed");
    });
    await expect(importRepository.listMovements("request-1")).rejects.toThrow(
      "movement read failed",
    );
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_movements_query_failed",
      expect.any(Object),
    );
  });
  it("persists successive complete snapshots and returns only the latest items", async () => {
    const persisted: unknown[][] = [];
    let importNumber = 0;
    mocks.client.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        importNumber += 1;
        const transaction = { insert: vi.fn() };
        transaction.insert
          .mockReturnValueOnce({
            values: () => ({
              returning: async () => [{ id: `import-${importNumber}` }],
            }),
          })
          .mockReturnValueOnce({
            values: () => ({
              returning: async () => [
                {
                  id: `snapshot-${importNumber}`,
                  importId: `import-${importNumber}`,
                },
              ],
            }),
          })
          .mockReturnValueOnce({
            values: async (items: unknown[]) => persisted.push(items),
          });
        return callback(transaction);
      },
    );
    const firstSnapshot = Array.from({ length: 24 }, (_, index) => ({
      product: `Ativo ${index + 1}`,
      quantity: "1",
    }));
    const secondSnapshot = [
      ...firstSnapshot,
      { product: "Ativo 25", quantity: "1" },
    ];

    await importRepository.create({
      fileName: "dia-1.xlsx",
      fileHash: "hash-1",
      documentType: "B3_POSITION_XLSX",
      documentType: "B3_POSITION_XLSX",
      positions: firstSnapshot as never,
    });
    await importRepository.create({
      fileName: "dia-2.xlsx",
      fileHash: "hash-2",
      documentType: "B3_POSITION_XLSX",
      documentType: "B3_POSITION_XLSX",
      positions: secondSnapshot as never,
    });

    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toHaveLength(24);
    expect(persisted[1]).toHaveLength(25);
    mocks.client.select
      .mockReturnValueOnce(chain([{ id: "snapshot-2" }]))
      .mockReturnValueOnce(chain(secondSnapshot));
    await expect(importRepository.listLatestPositions()).resolves.toEqual(
      secondSnapshot,
    );
  });
});
