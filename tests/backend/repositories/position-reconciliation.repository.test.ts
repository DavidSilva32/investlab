import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: { select: vi.fn(), transaction: vi.fn() },
  logger: { error: vi.fn() },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => mocks.client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));
import { PositionReconciliationRepository } from "@/backend/repositories/position-reconciliation.repository";
import { positionReconciliationEvents } from "@/infrastructure/database/schema";

describe("position reconciliation audit repository", () => {
  const repository = new PositionReconciliationRepository();
  beforeEach(() => vi.clearAllMocks());
  it("lists immutable audit events in deterministic order", async () => {
    const rows = [{ id: "event" }];
    const where = vi.fn().mockReturnValue({ orderBy: async () => rows });
    const from = vi.fn().mockReturnValue({ where });
    mocks.client.select.mockReturnValue({ from });
    await expect(repository.listEvents()).resolves.toBe(rows);
    expect(from).toHaveBeenCalledWith(positionReconciliationEvents);
    expect(where.mock.calls[0]?.[0].queryChunks).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "owner-1" })]),
    );
  });
  it("logs failed audit reads without hiding failure", async () => {
    const error = new Error("unavailable");
    mocks.client.select.mockImplementation(() => {
      throw error;
    });
    await expect(repository.listEvents("request")).rejects.toBe(error);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "position_reconciliation_query_failed",
      { requestId: "request", error },
    );
  });
  it("appends a reversal without modifying the linked source or original audit event", async () => {
    const previous = {
      manualAssetKey: "manual:1",
      importedAssetKey: "b3",
      id: "link",
      effectiveFrom: "2026-09-01",
      status: "LINK",
      recordedAt: new Date(Date.now() + 5000),
      importId: "import",
    };
    let appended: unknown;
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({ where: () => ({ orderBy: async () => [previous] }) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: (value: unknown) => {
          appended = value;
          return { returning: async () => [value] };
        },
      }),
    };
    mocks.client.transaction.mockImplementation((callback) => callback(tx));
    await expect(
      repository.reverse("manual:1", "2026-10-11", "request"),
    ).resolves.toEqual(expect.objectContaining({ status: "UNLINK" }));
    expect(appended).toEqual({
      manualAssetKey: "manual:1",
      importedAssetKey: "b3",
      status: "UNLINK",
      recordedAt: new Date(previous.recordedAt.getTime() + 1),
      effectiveFrom: "2026-10-11",
      requestId: "request",
      userId: "owner-1",
    });
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledWith(positionReconciliationEvents);
    expect(previous.status).toBe("LINK");
  });
  it("reopens a prior explicit separate decision for the selected pair", async () => {
    const previous = {
      manualAssetKey: "manual:one",
      importedAssetKey: "b3:one",
      id: "separate",
      effectiveFrom: "2026-09-01",
      status: "SEPARATE",
      recordedAt: new Date("2026-09-02T00:00:00Z"),
    };
    let appended: unknown;
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({ where: () => ({ orderBy: async () => [previous] }) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: (value: unknown) => {
          appended = value;
          return { returning: async () => [value] };
        },
      }),
    };
    mocks.client.transaction.mockImplementation((callback) => callback(tx));

    await expect(
      repository.reverse("manual:one", "2026-10-11", "request", "b3:one"),
    ).resolves.toMatchObject({ status: "UNLINK", importedAssetKey: "b3:one" });
    expect(appended).toEqual(
      expect.objectContaining({
        manualAssetKey: "manual:one",
        importedAssetKey: "b3:one",
        status: "UNLINK",
        effectiveFrom: "2026-10-11",
        requestId: "request",
      }),
    );
  });
  it("does not reopen a pair whose latest decision is linked or absent", async () => {
    for (const rows of [
      [
        {
          manualAssetKey: "manual:one",
          importedAssetKey: "b3:one",
          status: "LINK",
          effectiveFrom: "2026-09-01",
          recordedAt: new Date("2026-09-02T00:00:00Z"),
        },
      ],
      [],
    ]) {
      const tx = {
        execute: vi.fn(),
        select: () => ({
          from: () => ({ where: () => ({ orderBy: async () => rows }) }),
        }),
        insert: vi.fn(),
      };
      mocks.client.transaction.mockImplementation((callback) => callback(tx));

      await expect(
        repository.reverse("manual:one", "2026-10-11", "request", "b3:one"),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(tx.insert).not.toHaveBeenCalled();
    }
  });
  it.each(
    [[], [{ status: "UNLINK" }], [{ status: "SEPARATE" }]].map((rows) => ({
      rows,
    })),
  )("rejects reversals without an active link (%j)", async ({ rows }) => {
    const tx = {
      execute: vi.fn(),
      select: () => ({
        from: () => ({ where: () => ({ orderBy: async () => rows }) }),
      }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation((callback) => callback(tx));
    await expect(
      repository.reverse("manual:1", "2026-10-11", "request"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.insert).not.toHaveBeenCalled();
  });
  it("logs failed reversals", async () => {
    const error = new Error("failed");
    mocks.client.transaction.mockRejectedValueOnce(error);
    await expect(
      repository.reverse("manual:1", "2026-10-11", "request"),
    ).rejects.toBe(error);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "position_reconciliation_reverse_failed",
      { requestId: "request", error },
    );
  });
});
