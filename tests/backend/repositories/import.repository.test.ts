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
import { createTreasurySelicLiquidityFact } from "@/backend/services/treasury-selic-liquidity";

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
    let persistedPositions: unknown[] = [];
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
      .mockReturnValueOnce({
        values: (items: unknown[]) => ({
          returning: async () => {
            persistedPositions = items;
            return [{ id: "position-1" }];
          },
        }),
      });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.create({
        fileName: "b3.xlsx",
        fileHash: "hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-18",
        positions,
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot-1" });
    expect(persistedPositions).toEqual([
      expect.objectContaining({
        snapshotId: "snapshot-1",
        valuationSource: "CURVA",
        curveUnitPrice: "0.01059225",
        curveTotalValue: "3177.67",
      }),
    ]);
  });

  it("persists a new liquidity fact with its source position and snapshot", async () => {
    const persistedFacts: unknown[][] = [];
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
      .mockReturnValueOnce({
        values: (items: Array<{ id: string }>) => ({
          returning: async () => items.map(({ id }) => ({ id })).reverse(),
        }),
      })
      .mockReturnValueOnce({
        values: async (facts: unknown[]) => persistedFacts.push(facts),
      });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const selicPosition = {
      product: "Tesouro Selic 2029",
      maturityAt: "2029-03-01",
      quantity: "1",
      availableQuantity: "1",
      unavailableQuantity: "0",
      institution: "Corretora",
      assetCode: "LFT-2029",
      referenceDate: "2026-09-28",
    };
    const liquidityFact = createTreasurySelicLiquidityFact(selicPosition);

    await importRepository.create({
      fileName: "selic.xlsx",
      fileHash: "selic-hash",
      documentType: "B3_POSITION_XLSX",
      referenceDate: "2026-09-28",
      positions: [selicPosition as never],
      liquidityFacts: [liquidityFact && { ...liquidityFact, asOf: null }],
    });

    expect(persistedFacts).toEqual([
      [
        expect.objectContaining({
          positionItemId: expect.any(String),
          snapshotId: "snapshot-1",
          ruleVersion: "portaria-mf-1748-2024-v1",
          status: "determined",
          asOf: "2026-09-28",
          availableQuantity: "1",
          source: "B3_POSITION_XLSX",
        }),
      ],
    ]);
  });

  it("links multiple liquidity facts to their positions when RETURNING order differs", async () => {
    const insertedPositions: Array<Record<string, unknown>> = [];
    const persistedFacts: Array<Record<string, unknown>> = [];
    const transaction = { insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-1" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "snapshot-1" }] }),
      })
      .mockReturnValueOnce({
        values: (items: Array<Record<string, unknown>>) => {
          insertedPositions.push(...items);
          return {
            returning: async () =>
              items.map(({ id }) => ({ id: id as string })).reverse(),
          };
        },
      })
      .mockReturnValueOnce({
        values: async (facts: Array<Record<string, unknown>>) =>
          persistedFacts.push(...facts),
      });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const inputs = [
      {
        product: "Tesouro Selic 2029",
        maturityAt: "2029-03-01",
        quantity: "1",
        availableQuantity: "0.75",
        unavailableQuantity: "0.25",
        institution: "Corretora A",
        assetCode: "LFT-A",
        referenceDate: "2026-09-28",
      },
      {
        product: "Tesouro Selic 2031",
        maturityAt: "2031-03-01",
        quantity: "2",
        availableQuantity: "1.5",
        unavailableQuantity: "0.5",
        institution: "Corretora B",
        assetCode: "LFT-B",
        referenceDate: "2026-09-28",
      },
    ];
    await importRepository.create({
      fileName: "selic.xlsx",
      fileHash: "multi-selic-hash",
      documentType: "B3_POSITION_XLSX",
      referenceDate: "2026-09-28",
      positions: inputs as never,
      liquidityFacts: inputs.map((input) =>
        createTreasurySelicLiquidityFact(input),
      ),
    });

    expect(insertedPositions).toHaveLength(2);
    expect(persistedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          positionItemId: insertedPositions[0].id,
          institution: "Corretora A",
          assetCode: "LFT-A",
          availableQuantity: "0.75",
        }),
        expect.objectContaining({
          positionItemId: insertedPositions[1].id,
          institution: "Corretora B",
          assetCode: "LFT-B",
          availableQuantity: "1.5",
        }),
      ]),
    );
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
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-18",
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
  it("returns the latest position fact with its versioned general rule", async () => {
    const position = { id: "position-1", product: "Tesouro Selic 2029" };
    const fact = {
      positionItemId: "position-1",
      ruleVersion: "portaria-mf-1748-2024-v1",
      status: "determined",
    };
    const rule = {
      version: "portaria-mf-1748-2024-v1",
      sourceTitle: "Regulamento do Programa Tesouro Direto",
    };
    mocks.client.select
      .mockReturnValueOnce(
        chain([{ id: "snapshot-1", referenceDate: "2026-09-28" }]),
      )
      .mockReturnValueOnce(chain([position]))
      .mockReturnValueOnce({ from: () => ({ where: async () => [fact] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [rule] }) });

    await expect(importRepository.listLatestPositions()).resolves.toEqual([
      {
        ...position,
        referenceDate: "2026-09-28",
        liquidityProfile: { ...fact, rule },
      },
    ]);
  });
  it("returns a null rule when its recorded rule version is unavailable", async () => {
    const position = { id: "position-1", product: "Tesouro Selic 2029" };
    const fact = {
      positionItemId: "position-1",
      ruleVersion: "missing-rule-version",
      status: "indeterminate",
    };
    mocks.client.select
      .mockReturnValueOnce(
        chain([{ id: "snapshot-1", referenceDate: "2026-09-28" }]),
      )
      .mockReturnValueOnce(chain([position]))
      .mockReturnValueOnce({ from: () => ({ where: async () => [fact] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(importRepository.listLatestPositions()).resolves.toEqual([
      {
        ...position,
        referenceDate: "2026-09-28",
        liquidityProfile: { ...fact, rule: null },
      },
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
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const persistMovements = vi.fn().mockReturnValue({ onConflictDoNothing });
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
            eventFingerprint: "a".repeat(32),
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
      expect.objectContaining({
        importId: "import-1",
        eventFingerprint: "a".repeat(32),
        direction: "CREDITO",
      }),
    ]);
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.anything(),
    });
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
  it("deletes movement imports and their items", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi.fn().mockReturnValue({
        from: () => ({ where: async () => [{ id: "movement-import" }] }),
      }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.delete).toHaveBeenCalledTimes(2);
  });

  it("deletes position items, snapshots and imports", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "position-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "snapshot-1" }] }),
        }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_POSITION_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.delete).toHaveBeenCalledTimes(3);
  });

  it("removes a position import even when its snapshot is absent", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "position-import" }] }),
        })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) }),
      delete: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_POSITION_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.delete).toHaveBeenCalledTimes(1);
  });
  it("does not delete when no matching import exists and logs deletion failures", async () => {
    const emptyTransaction = {
      select: vi
        .fn()
        .mockReturnValue({ from: () => ({ where: async () => [] }) }),
      delete: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof emptyTransaction) => unknown) =>
        callback(emptyTransaction),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX"),
    ).resolves.toBe(0);
    mocks.client.transaction.mockRejectedValueOnce(new Error("delete failed"));
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX", "request-1"),
    ).rejects.toThrow("delete failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_import_deletion_failed",
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
            values: (items: unknown[]) => ({
              returning: async () => {
                persisted.push(items);
                return firstSnapshot.map((_, index) => ({
                  id: `position-${index}`,
                }));
              },
            }),
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
      referenceDate: "2026-09-18",
      positions: firstSnapshot as never,
    });
    await importRepository.create({
      fileName: "dia-2.xlsx",
      fileHash: "hash-2",
      documentType: "B3_POSITION_XLSX",
      referenceDate: "2026-09-18",
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
