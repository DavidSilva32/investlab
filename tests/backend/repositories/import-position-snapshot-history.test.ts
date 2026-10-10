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
            importedAt: new Date("2026-10-02T12:00:00Z"),
            source: "B3",
          },
          {
            id: "snapshot-2",
            referenceDate: null,
            importReferenceDate: "2026-10-31",
            createdAt: new Date("2026-11-01T12:00:00Z"),
            importedAt: new Date("2026-11-02T12:00:00Z"),
            source: "B3",
          },
        ]),
      )
      .mockReturnValueOnce(
        positionQuery([
          {
            snapshotId: "snapshot-1",
            product: "CDB",
            institution: "Banco A",
            issuer: "Emissor A",
            assetCode: "CDB123",
            indexer: null,
            regimeType: null,
            issuedAt: "2025-01-01",
            maturityAt: "2027-01-01",
            totalValue: "12.34",
            valuationSource: "CURVA",
          },
          {
            snapshotId: "snapshot-1",
            product: "Debênture",
            institution: null,
            issuer: null,
            assetCode: "DEB123",
            indexer: null,
            regimeType: null,
            issuedAt: null,
            maturityAt: null,
            totalValue: "15.00",
            valuationSource: "FECHAMENTO",
          },
          {
            snapshotId: "snapshot-1",
            product: "LCI",
            institution: "Banco B",
            issuer: "Emissor B",
            assetCode: null,
            indexer: null,
            regimeType: null,
            issuedAt: "2025-02-01",
            maturityAt: "2027-02-01",
            totalValue: "22.00",
            valuationSource: "CURVA",
          },
          {
            snapshotId: "snapshot-1",
            product: "LCI CDI",
            institution: "Banco C",
            issuer: "Emissor C",
            assetCode: null,
            indexer: "CDI",
            regimeType: "POS",
            issuedAt: "2025-03-01",
            maturityAt: "2027-03-01",
            totalValue: "30.00",
            valuationSource: "CURVA",
          },
          {
            snapshotId: "snapshot-1",
            product: "Produto sem identidade",
            institution: null,
            issuer: null,
            assetCode: null,
            indexer: null,
            regimeType: null,
            issuedAt: null,
            maturityAt: null,
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
        importedAt: new Date("2026-10-02T12:00:00Z"),
        source: "B3",
        positions: [
          {
            identity: '["CDB123","CDB","BANCO A","EMISSOR A"]',
            totalValue: "12.34",
            valuationSource: "CURVA",
          },
          {
            identity: '["DEB123","DEBÊNTURE",null,null]',
            totalValue: "15.00",
            valuationSource: "FECHAMENTO",
          },
          {
            identity:
              '["LCI","BANCO B","EMISSOR B",null,null,"2025-02-01","2027-02-01"]',
            totalValue: "22.00",
            valuationSource: "CURVA",
          },
          {
            identity:
              '["LCI CDI","BANCO C","EMISSOR C","CDI","POS","2025-03-01","2027-03-01"]',
            totalValue: "30.00",
            valuationSource: "CURVA",
          },
          { identity: null, totalValue: null, valuationSource: null },
        ],
      },
      {
        id: "snapshot-2",
        referenceDate: "2026-10-31",
        createdAt: new Date("2026-11-01T12:00:00Z"),
        importedAt: new Date("2026-11-02T12:00:00Z"),
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
