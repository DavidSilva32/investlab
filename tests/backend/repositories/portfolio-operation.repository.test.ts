import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  client: { select: vi.fn(), insert: vi.fn(), transaction: vi.fn() },
  logger: { error: vi.fn() },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => mocks.client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { PortfolioOperationRepository } from "@/backend/repositories/portfolio-operation.repository";
import {
  manualPortfolioOperations,
  movementItems,
  portfolioOperationReconciliationEvents,
} from "@/infrastructure/database/schema";

const operation = {
  id: "op-1",
  side: "BUY",
  effectiveDate: "2026-10-01",
  product: "Empresa",
  assetCode: "EMP3",
  quantity: "1",
  unitPrice: "10",
  currency: "BRL",
  fees: null,
};
const movement = { id: "movement-1" };
const operationInput = {
  side: "BUY" as const,
  effectiveDate: "2026-10-01",
  product: "Empresa",
  assetCode: "EMP3",
  quantity: "1",
  unitPrice: "10",
  currency: "BRL",
  fees: null,
};
const idempotencyKey = "58cde392-a188-41a6-88a7-6c2a4927025d";

const readChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  chain.where = () => chain;
  chain.orderBy = async () => rows;
  chain.limit = async () => rows;
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PortfolioOperationRepository", () => {
  it("lists immutable operation and movement origins with their audit events", async () => {
    const rowsFor = (table: unknown) =>
      table === manualPortfolioOperations
        ? [operation]
        : table === movementItems
          ? [movement]
          : table === portfolioOperationReconciliationEvents
            ? []
            : [];
    mocks.client.select.mockReturnValue({
      from: (table: unknown) => readChain(rowsFor(table)),
    });
    await expect(
      new PortfolioOperationRepository().list("r1"),
    ).resolves.toEqual({
      operations: [operation],
      movements: [movement],
      events: [],
    });
  });

  it("reads at most 50 recent rows per MCP category with bounded SQL limits and owner scoping", async () => {
    const limits: number[] = [];
    const filters: unknown[] = [];
    const orderings: unknown[][] = [];
    const rowsFor = (table: unknown) =>
      Array.from({ length: 51 }, (_, index) => ({
        id: `${String(table)}-${index}`,
        eventOrder: index,
      }));
    mocks.client.select.mockImplementation(() => {
      const builder: Record<string, unknown> = {};
      let table: unknown;
      builder.from = (selectedTable: unknown) => {
        table = selectedTable;
        return builder;
      };
      builder.where = (filter: unknown) => {
        filters.push(filter);
        return builder;
      };
      builder.orderBy = (...ordering: unknown[]) => {
        orderings.push(ordering);
        return builder;
      };
      builder.limit = (limit: number) => {
        limits.push(limit);
        return Promise.resolve(rowsFor(table));
      };
      return builder;
    });

    const result = await new PortfolioOperationRepository().listRecentForMcp(
      "mcp-recent",
    );

    expect(limits).toEqual([51, 51, 51]);
    expect(orderings).toHaveLength(3);
    expect(orderings.map((ordering) => ordering.length)).toEqual([3, 3, 2]);
    expect(filters).toHaveLength(3);
    expect(
      filters.every((filter) => {
        if (!filter || typeof filter !== "object" || !("queryChunks" in filter))
          return false;
        const queryChunks = (filter as { queryChunks: unknown[] }).queryChunks;
        return queryChunks.some(
          (chunk) =>
            chunk !== null &&
            chunk !== undefined &&
            typeof chunk === "object" &&
            "value" in chunk &&
            chunk.value === "owner-1",
        );
      }),
    ).toBe(true);
    expect(result.operations).toHaveLength(50);
    expect(result.movements).toHaveLength(50);
    expect(result.reconciliationEvents).toHaveLength(50);
    expect(result.hasMore).toEqual({
      operations: true,
      movements: true,
      reconciliationEvents: true,
    });
  });

  it("logs query and insert errors", async () => {
    const repository = new PortfolioOperationRepository();
    mocks.client.select.mockImplementation(() => {
      throw new Error("read failure");
    });
    await expect(repository.list("r1")).rejects.toThrow("read failure");
    mocks.client.insert.mockImplementation(() => {
      throw new Error("write failure");
    });
    await expect(repository.create(operationInput, "r2")).rejects.toThrow(
      "write failure",
    );
    expect(mocks.logger.error).toHaveBeenCalledTimes(2);
  });

  it("creates a manual operation with its idempotency key", async () => {
    const returning = vi.fn().mockResolvedValue([operation]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    mocks.client.insert.mockReturnValue({ values });
    await expect(
      new PortfolioOperationRepository().create(operationInput, idempotencyKey),
    ).resolves.toEqual(operation);
    expect(values).toHaveBeenCalledWith({
      ...operationInput,
      idempotencyKey,
      userId: "owner-1",
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [
        manualPortfolioOperations.userId,
        manualPortfolioOperations.idempotencyKey,
      ],
    });
  });

  it("scopes operation, movement and reconciliation event reads to the owner", async () => {
    const filters: unknown[] = [];
    const query = (rows: unknown[]) => {
      const builder: Record<string, unknown> = {};
      builder.from = () => builder;
      builder.where = (filter: unknown) => {
        filters.push(filter);
        return builder;
      };
      builder.orderBy = async () => rows;
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve);
      return builder;
    };
    mocks.client.select
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([]));
    await expect(new PortfolioOperationRepository().list()).resolves.toEqual({
      operations: [],
      movements: [],
      events: [],
    });
    expect(filters).toHaveLength(3);
    expect(
      filters.every((filter) => {
        if (!filter || typeof filter !== "object" || !("queryChunks" in filter))
          return false;
        const queryChunks = (filter as { queryChunks: unknown[] }).queryChunks;
        return queryChunks.some(
          (chunk) =>
            chunk !== null &&
            chunk !== undefined &&
            typeof chunk === "object" &&
            "value" in chunk &&
            chunk.value === "owner-1",
        );
      }),
    ).toBe(true);
  });

  it("returns the prior row on a retry and rejects key reuse with another payload", async () => {
    const rows: Array<
      Omit<typeof operation, "fees"> & {
        fees: string | null;
        idempotencyKey: string;
      }
    > = [];
    const retryInput = {
      ...operationInput,
      quantity: "9007199254740993",
      unitPrice: "9007199254740993.12345",
      fees: "0000",
    };
    const databaseNumeric = (value: string) => {
      const [integer = "0", fraction = ""] = value.split(".");
      return `${integer}.${fraction.padEnd(8, "0")}`;
    };
    mocks.client.insert.mockImplementation(() => ({
      values: (value: typeof operationInput & { idempotencyKey: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (rows.some((row) => row.idempotencyKey === value.idempotencyKey))
              return [];
            const inserted = {
              ...operation,
              ...value,
              quantity: databaseNumeric(value.quantity),
              unitPrice: databaseNumeric(value.unitPrice),
              fees: value.fees === null ? null : databaseNumeric(value.fees),
              id: "stable-operation-id",
            };
            rows.push(inserted);
            return [inserted];
          },
        }),
      }),
    }));
    mocks.client.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    });
    const repository = new PortfolioOperationRepository();
    const first = await repository.create(retryInput, idempotencyKey);
    const retry = await repository.create(retryInput, idempotencyKey);
    expect(retry).toEqual(first);
    expect(retry.id).toBe("stable-operation-id");
    expect(rows).toHaveLength(1);
    await expect(
      repository.create(
        { ...retryInput, quantity: "9007199254740992" },
        idempotencyKey,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(rows).toHaveLength(1);
  });

  it("retries a database-scaled operation with null fees", async () => {
    const existing = {
      ...operation,
      quantity: "1.00000000",
      unitPrice: "10.00000000",
      idempotencyKey,
    };
    mocks.client.insert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    });
    mocks.client.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [existing] }) }),
    });

    await expect(
      new PortfolioOperationRepository().create(operationInput, idempotencyKey),
    ).resolves.toEqual(existing);
  });

  it("reports an impossible empty idempotency conflict lookup", async () => {
    mocks.client.insert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    });
    mocks.client.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    });
    await expect(
      new PortfolioOperationRepository().create(operationInput, idempotencyKey),
    ).rejects.toThrow("Idempotent operation insert returned no row");
  });

  const transactionFor = (
    events: Array<{
      operationId: string;
      movementId: string;
      status: "LINK" | "UNLINK";
    }>,
    rows = [operation],
    source = [movement],
  ) => {
    const tx: Record<string, unknown> = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: (table: unknown) =>
          readChain(
            table === manualPortfolioOperations
              ? rows
              : table === movementItems
                ? source
                : events,
          ),
      }),
      insert: vi.fn().mockReturnValue({
        values: (value: unknown) => ({
          returning: async () => [{ id: "event-1", ...(value as object) }],
        }),
      }),
    };
    return tx;
  };

  it("replays event order after acquiring the lock, independent of recordedAt", async () => {
    const eventRows = [
      {
        operationId: "op-1",
        movementId: "movement-1",
        status: "LINK" as const,
        eventOrder: 1,
        recordedAt: new Date("2026-10-02T00:00:00Z"),
      },
      {
        operationId: "op-1",
        movementId: "movement-1",
        status: "UNLINK" as const,
        eventOrder: 2,
        recordedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ];
    const callOrder: string[] = [];
    const tx = transactionFor(eventRows);
    const select = tx.select as ReturnType<typeof vi.fn>;
    select.mockImplementation(() => ({
      from: (table: unknown) => {
        const chain = readChain(
          table === manualPortfolioOperations
            ? [operation]
            : table === movementItems
              ? [movement]
              : eventRows,
        );
        const originalOrderBy = chain.orderBy as () => unknown;
        chain.orderBy = (column: unknown) => {
          if (table === portfolioOperationReconciliationEvents) {
            callOrder.push("events");
            expect(column).toEqual(
              asc(portfolioOperationReconciliationEvents.eventOrder),
            );
            return originalOrderBy();
          }
          return originalOrderBy();
        };
        return chain;
      },
    }));
    const execute = tx.execute as ReturnType<typeof vi.fn>;
    execute.mockImplementation(async () => {
      callOrder.push("lock");
    });
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "LINK",
        "r1",
      ),
    ).resolves.toMatchObject({ status: "LINK" });
    expect(callOrder).toEqual(["lock", "events"]);
  });

  it("serializes and appends a confirmed link", async () => {
    const tx = transactionFor([]);
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "LINK",
        "r1",
      ),
    ).resolves.toMatchObject({
      operationId: "op-1",
      movementId: "movement-1",
      status: "LINK",
      requestId: "r1",
    });
    expect(tx.execute).toHaveBeenCalledOnce();
  });

  it("appends an unlink event only for the currently active pair", async () => {
    const tx = transactionFor([
      { operationId: "op-1", movementId: "movement-2", status: "LINK" },
      { operationId: "op-1", movementId: "movement-2", status: "UNLINK" },
      { operationId: "op-1", movementId: "movement-1", status: "LINK" },
      { operationId: "op-1", movementId: "movement-2", status: "UNLINK" },
    ]);
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof tx) => unknown) => callback(tx),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "UNLINK",
        "r1",
      ),
    ).resolves.toMatchObject({
      operationId: "op-1",
      movementId: "movement-1",
      status: "UNLINK",
    });
    const linkedElsewhere = transactionFor([
      { operationId: "op-1", movementId: "movement-2", status: "LINK" },
    ]);
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof linkedElsewhere) => unknown) =>
        callback(linkedElsewhere),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "UNLINK",
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects missing sources, repeated links and attempts to reuse either side", async () => {
    const repository = new PortfolioOperationRepository();
    const missing = transactionFor([], [], []);
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof missing) => unknown) => callback(missing),
    );
    await expect(
      repository.reconcile("op-1", "movement-1", "LINK", "r1"),
    ).rejects.toMatchObject({ statusCode: 409 });

    const linked = transactionFor([
      { operationId: "op-1", movementId: "movement-1", status: "LINK" },
    ]);
    mocks.client.transaction.mockImplementation(
      (callback: (value: typeof linked) => unknown) => callback(linked),
    );
    await expect(
      repository.reconcile("op-1", "movement-1", "LINK", "r1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      repository.reconcile("op-1", "movement-2", "LINK", "r1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      repository.reconcile("op-2", "movement-1", "LINK", "r1"),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("logs unexpected transaction failures while preserving expected validation errors", async () => {
    mocks.client.transaction.mockRejectedValue(
      new Error("transaction failure"),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "LINK",
        "r1",
      ),
    ).rejects.toThrow("transaction failure");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_portfolio_operation_reconciliation_failed",
      expect.any(Object),
    );
    mocks.client.transaction.mockImplementation(
      (callback: (value: unknown) => unknown) =>
        callback(transactionFor([], [], [])),
    );
    await expect(
      new PortfolioOperationRepository().reconcile(
        "op-1",
        "movement-1",
        "LINK",
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.logger.error).toHaveBeenCalledOnce();
  });
});
