import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  for: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { McpMutationReplaysRepository } from "@/backend/repositories/mcp-mutation-replays.repository";

const key = {
  operation: "create_objective" as const,
  key: "operation-key",
  payloadHash: "a".repeat(64),
};

const sqlParameterValues = (chunk: unknown): string[] => {
  if (typeof chunk === "string") return [];
  if (Array.isArray(chunk)) return chunk.flatMap(sqlParameterValues);
  if (!chunk || typeof chunk !== "object") return [];
  const value = chunk as { queryChunks?: unknown[]; value?: unknown };
  if (Array.isArray(value.queryChunks)) {
    return value.queryChunks.flatMap(sqlParameterValues);
  }
  return typeof value.value === "string" ? [value.value] : [];
};

describe("McpMutationReplaysRepository", () => {
  const repository = new McpMutationReplaysRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    database.insert.mockReturnValue(database);
    database.values.mockReturnValue(database);
    database.onConflictDoNothing.mockReturnValue(database);
    database.select.mockReturnValue(database);
    database.from.mockReturnValue(database);
    database.where.mockReturnValue(database);
    database.for.mockReturnValue(database);
    database.limit.mockResolvedValue([]);
    database.returning.mockResolvedValue([{ id: "replay-id" }]);
    database.update.mockReturnValue(database);
    database.set.mockReturnValue(database);
  });

  it("reserves an owner-scoped key once and returns a locked replay for the same payload", async () => {
    await expect(repository.reserve(database as never, key)).resolves.toEqual({
      replayed: false,
    });
    expect(database.values).toHaveBeenCalledWith({
      userId: "owner-1",
      operation: key.operation,
      idempotencyKey: key.key,
      payloadHash: key.payloadHash,
    });
    expect(database.onConflictDoNothing).toHaveBeenCalled();

    database.returning.mockResolvedValueOnce([]);
    database.limit.mockResolvedValueOnce([
      { payloadHash: key.payloadHash, result: { id: "original-result" } },
    ]);
    await expect(repository.reserve(database as never, key)).resolves.toEqual({
      replayed: true,
      result: { id: "original-result" },
    });
    expect(database.for).toHaveBeenCalledWith("update");
    expect(sqlParameterValues(database.where.mock.calls.at(-1)?.[0])).toEqual(
      expect.arrayContaining(["owner-1", key.operation, key.key]),
    );
  });

  it("rejects a reused key with a different payload and an incomplete result", async () => {
    database.returning.mockResolvedValueOnce([]);
    database.limit.mockResolvedValueOnce([
      { payloadHash: "b".repeat(64), result: { id: "original" } },
    ]);
    await expect(
      repository.reserve(database as never, key),
    ).rejects.toMatchObject({
      statusCode: 409,
    });

    database.returning.mockResolvedValueOnce([]);
    database.limit.mockResolvedValueOnce([]);
    await expect(
      repository.reserve(database as never, key),
    ).rejects.toMatchObject({ statusCode: 409 });

    database.returning.mockResolvedValueOnce([]);
    database.limit.mockResolvedValueOnce([
      { payloadHash: key.payloadHash, result: null },
    ]);
    await expect(
      repository.reserve(database as never, key),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("persists the exact result under the owner, operation, key, and payload hash", async () => {
    const result = { deleted: true, objectiveId: "objective-1" };
    await expect(
      repository.complete(database as never, key, result),
    ).resolves.toBeUndefined();
    expect(database.set).toHaveBeenCalledWith({ result });
    expect(sqlParameterValues(database.where.mock.calls.at(-1)?.[0])).toEqual(
      expect.arrayContaining([
        "owner-1",
        key.operation,
        key.key,
        key.payloadHash,
      ]),
    );
  });

  it("fails completion if the owning transaction cannot persist the result", async () => {
    database.returning.mockResolvedValueOnce([]);
    await expect(
      repository.complete(database as never, key, { id: "result" }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("returns an owner-scoped replay and rejects a hash collision", async () => {
    database.limit.mockResolvedValueOnce([
      { payloadHash: key.payloadHash, result: { id: "position-1" } },
    ]);
    await expect(repository.find(key)).resolves.toEqual({ id: "position-1" });
    expect(sqlParameterValues(database.where.mock.calls.at(-1)?.[0])).toEqual(
      expect.arrayContaining(["owner-1", key.operation, key.key]),
    );

    database.limit.mockResolvedValueOnce([
      { payloadHash: "c".repeat(64), result: { id: "position-1" } },
    ]);
    await expect(repository.find(key)).rejects.toMatchObject({
      statusCode: 409,
    });

    database.limit.mockResolvedValueOnce([]);
    await expect(repository.find(key)).resolves.toBeNull();

    database.limit.mockResolvedValueOnce([
      { payloadHash: key.payloadHash, result: null },
    ]);
    await expect(repository.find(key)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
