import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  logger: { error: vi.fn() },
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => ({ select: mocks.select }),
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));

import { importRepository } from "@/backend/repositories/import.repository";

const snapshotQuery = (rows: unknown[]) => ({
  from: () => ({
    innerJoin: () => ({
      where: () => ({ orderBy: async () => rows }),
    }),
  }),
});
const positionQuery = (rows: unknown[]) => ({
  from: () => ({ where: async () => rows }),
});

describe("import repository position snapshot history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valued and unvalued positions grouped by confirmed close", async () => {
    mocks.select
      .mockReturnValueOnce(
        snapshotQuery([
          {
            id: "snapshot-1",
            referenceDate: "2026-09-30",
            importReferenceDate: "2026-09-30",
            createdAt: new Date("2026-10-01T12:00:00Z"),
            source: "B3",
          },
          {
            id: "snapshot-2",
            referenceDate: null,
            importReferenceDate: "2026-10-31",
            createdAt: new Date("2026-11-01T12:00:00Z"),
            source: "B3",
          },
        ]),
      )
      .mockReturnValueOnce(
        positionQuery([
          {
            snapshotId: "snapshot-1",
            totalValue: "12.34",
            valuationSource: "CURVA",
          },
          {
            snapshotId: "snapshot-1",
            totalValue: null,
            valuationSource: null,
          },
        ]),
      );

    await expect(
      importRepository.listPositionSnapshots("request-1"),
    ).resolves.toEqual([
      {
        id: "snapshot-1",
        referenceDate: "2026-09-30",
        createdAt: new Date("2026-10-01T12:00:00Z"),
        source: "B3",
        positions: [
          { totalValue: "12.34", valuationSource: "CURVA" },
          { totalValue: null, valuationSource: null },
        ],
      },
      {
        id: "snapshot-2",
        referenceDate: "2026-10-31",
        createdAt: new Date("2026-11-01T12:00:00Z"),
        source: "B3",
        positions: [],
      },
    ]);
  });

  it("returns early when the database has no confirmed position snapshots", async () => {
    mocks.select.mockReturnValueOnce(snapshotQuery([]));
    await expect(importRepository.listPositionSnapshots()).resolves.toEqual([]);
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("logs and rethrows database failures without exposing a partial history", async () => {
    const error = new Error("database unavailable");
    mocks.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ orderBy: async () => Promise.reject(error) }),
        }),
      }),
    });

    await expect(
      importRepository.listPositionSnapshots("request-2"),
    ).rejects.toBe(error);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_position_snapshot_history_query_failed",
      { requestId: "request-2", error },
    );
  });
});
