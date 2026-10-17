import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { select: vi.fn(), transaction: vi.fn() },
  logger: { error: vi.fn() },
  forcedCandidates: null as unknown[] | null,
  forcedLinks: null as unknown[] | null,
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "owner-1",
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => mocks.client,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: mocks.logger }));
vi.mock(
  "@/backend/services/position-reconciliation",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/backend/services/position-reconciliation")
      >();
    return {
      ...actual,
      getReconciliationCandidates: (
        ...args: Parameters<typeof actual.getReconciliationCandidates>
      ) =>
        (mocks.forcedCandidates as ReturnType<
          typeof actual.getReconciliationCandidates
        > | null) ?? actual.getReconciliationCandidates(...args),
      unresolvedReconciliationCandidates: (
        ...args: Parameters<typeof actual.unresolvedReconciliationCandidates>
      ) =>
        (mocks.forcedCandidates as ReturnType<
          typeof actual.unresolvedReconciliationCandidates
        > | null) ?? actual.unresolvedReconciliationCandidates(...args),
      activeReconciliationLinks: (
        ...args: Parameters<typeof actual.activeReconciliationLinks>
      ) =>
        (mocks.forcedLinks as ReturnType<
          typeof actual.activeReconciliationLinks
        > | null) ?? actual.activeReconciliationLinks(...args),
    };
  },
);

import { importRepository } from "@/backend/repositories/import.repository";
import { prepareB3MovementForPersistence } from "@/backend/services/b3-movement-fingerprint";

function containsSqlParameter(
  value: unknown,
  expected: unknown,
  seen = new Set<object>(),
): boolean {
  if (value === expected) return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((nested) =>
    containsSqlParameter(nested, expected, seen),
  );
}
import { createTreasurySelicLiquidityFact } from "@/backend/services/treasury-selic-liquidity";
import {
  portfolioAssetClassifications,
  portfolioObjectivePositions,
  positionReconciliationEvents,
  imports,
  positionSnapshots,
  positionItems,
  manualPortfolioPositions,
  movementItems,
  tradingItems,
  b3ReconciliationEvents,
} from "@/infrastructure/database/schema";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import {
  activeReconciliationLinks,
  type ReconciliationEvent,
} from "@/backend/services/position-reconciliation";

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
  from: () => {
    const query: Record<string, unknown> = {};
    query.where = () => query;
    query.orderBy = () => query;
    query.limit = async () => result;
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return query;
  },
});
const queryChain = (result: unknown) => {
  const query: Record<string, unknown> = {};
  query.where = () => query;
  query.orderBy = () => query;
  query.limit = async () => result;
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return query;
};
const emptyImportGuard = () => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockReturnValue({
    from: () => ({
      where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
      orderBy: () => ({ limit: async () => [] }),
    }),
  }),
});
const withManualRead = <
  T extends {
    select: (...args: unknown[]) => { from: (table: unknown) => unknown };
  },
>(
  transaction: T,
) => ({
  ...transaction,
  select: (...args: unknown[]) => ({
    from: (table: unknown) =>
      table === manualPortfolioPositions ||
      table === positionReconciliationEvents
        ? { where: () => Promise.resolve([]) }
        : table === manualPortfolioPositions
          ? { where: () => Promise.resolve([]) }
          : transaction.select(...args).from(table),
  }),
});
const sqlChunksText = (chunks: unknown[]) =>
  chunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;
        return Array.isArray(value) ? value.join("") : String(value);
      }
      return "";
    })
    .join("");

describe("import repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forcedCandidates = null;
    mocks.forcedLinks = null;
  });
  const reconciliationManual = {
    assetKey: "manual:1",
    product: "BBAS3",
    assetCode: "BBAS3" as string | null,
    institution: "Banco A",
    currency: "BRL",
    totalValue: "1000",
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  };
  const reconciliationPosition = {
    product: "BBAS3",
    assetCode: "BBAS3",
    institution: "Banco A",
    issuer: null,
    indexer: null,
    regimeType: null,
    issuedAt: null,
    maturityAt: null,
    quantity: "10",
    totalValue: "1000",
  };
  const reconciliationKey = getEmergencyReserveAssetKey(reconciliationPosition);
  const validDecision = {
    manualAssetKey: "manual:1",
    importedAssetKey: reconciliationKey,
    action: "link" as const,
    manualUpdatedAt: reconciliationManual.updatedAt.toISOString(),
  };
  function reconciliationTransaction(
    manual = [reconciliationManual],
    assignments: unknown[] = [],
    events: unknown[] = [],
    classifications: unknown[] = [],
    replay?: { imports: unknown[]; snapshots: unknown[] },
  ) {
    const audit: unknown[] = [];
    const transaction = {
      execute: vi.fn(),
      select: vi.fn().mockImplementation(() => ({
        from: (table: unknown) => {
          if (table === imports && replay) return queryChain(replay.imports);
          if (table === positionSnapshots)
            return queryChain(replay ? replay.snapshots : []);
          if (table === manualPortfolioPositions) return queryChain(manual);
          if (table === positionReconciliationEvents) return queryChain(events);
          if (table === portfolioAssetClassifications)
            return queryChain(classifications);
          if (table === portfolioObjectivePositions)
            return queryChain(assignments);
          return queryChain([]);
        },
      })),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: (rows: unknown) => {
          if (table === positionReconciliationEvents) {
            audit.push(rows);
            return Promise.resolve();
          }
          return {
            returning: async () =>
              table === imports
                ? [{ id: "import" }]
                : table === positionSnapshots
                  ? [{ id: "snapshot" }]
                  : [],
          };
        },
      })),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(transaction),
    );
    return { transaction, audit };
  }
  const reconciliationInput = {
    fileName: "b3.xlsx",
    fileHash: "hash",
    documentType: "B3_POSITION_XLSX" as const,
    referenceDate: "2026-09-30",
    positions: [reconciliationPosition] as never,
  };
  const replayRows = {
    imports: [{ id: "original-import", referenceDate: "2026-09-30" }],
    snapshots: [{ id: "original-snapshot", referenceDate: "2026-09-30" }],
  };
  it("conciles an existing import by appending only audit events without rewriting historical values", async () => {
    const { transaction, audit } = reconciliationTransaction(
      undefined,
      [],
      [],
      [],
      replayRows,
    );
    await expect(
      importRepository.create(
        {
          ...reconciliationInput,
          reconcileExistingImport: true,
          reconciliationDecisions: [validDecision],
        },
        "req",
      ),
    ).resolves.toEqual({
      importId: "original-import",
      snapshotId: "original-snapshot",
    });
    expect(transaction.insert).toHaveBeenCalledOnce();
    expect(transaction.insert).toHaveBeenCalledWith(
      positionReconciliationEvents,
    );
    expect(audit).toEqual([
      [
        expect.objectContaining({
          importId: "original-import",
          effectiveFrom: "2026-09-30",
        }),
      ],
    ]);
  });
  it.each([
    { imports: [], snapshots: [] },
    {
      imports: [{ id: "original-import", referenceDate: null }],
      snapshots: [],
    },
    {
      imports: [{ id: "original-import", referenceDate: "2026-08-31" }],
      snapshots: [],
    },
    { imports: replayRows.imports, snapshots: [] },
    {
      imports: replayRows.imports,
      snapshots: [{ id: "original-snapshot", referenceDate: "2026-08-31" }],
    },
  ])(
    "rejects existing-file reconciliation when reference metadata differs or is missing (%j)",
    async (replay) => {
      const { transaction } = reconciliationTransaction(
        undefined,
        [],
        [],
        [],
        replay,
      );
      await expect(
        importRepository.create({
          ...reconciliationInput,
          reconcileExistingImport: true,
          reconciliationDecisions: [validDecision],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );
  it.each(
    [undefined, []].map((reconciliationDecisions) => ({
      reconciliationDecisions,
    })),
  )(
    "rejects replay without explicit decisions (%j)",
    async ({ reconciliationDecisions }) => {
      const { transaction } = reconciliationTransaction(
        [],
        [],
        [],
        [],
        replayRows,
      );
      await expect(
        importRepository.create({
          ...reconciliationInput,
          reconcileExistingImport: true,
          reconciliationDecisions,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );
  it.each(
    [
      [],
      [{ ...validDecision, manualUpdatedAt: "stale" }],
      [{ ...validDecision, manualAssetKey: "missing" }],
      [{ ...validDecision, importedAssetKey: "missing" }],
      [validDecision, validDecision],
    ].map((decisions) => ({ decisions })),
  )(
    "rejects absent, stale, changed or duplicate reconciliation decisions (%j)",
    async ({ decisions }) => {
      const { transaction } = reconciliationTransaction();
      await expect(
        importRepository.create({
          ...reconciliationInput,
          reconciliationDecisions: decisions,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );
  it("recomputes and accepts a normalized product candidate when the manual CDB has no certificate code", async () => {
    const manual = {
      ...reconciliationManual,
      product: "CDB Banco Inter",
      assetCode: null,
      institution: "Banco Inter",
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    };
    const importedPosition = {
      ...reconciliationPosition,
      product: "CDB - BANCO INTER S/A",
      assetCode: "CDBA266ZVZV",
      institution: "Banco Inter",
      totalValue: "3000",
    };
    const importedKey = getEmergencyReserveAssetKey(importedPosition);
    const { audit } = reconciliationTransaction([manual]);

    await expect(
      importRepository.create({
        ...reconciliationInput,
        positions: [importedPosition] as never,
        reconciliationDecisions: [
          {
            manualAssetKey: manual.assetKey,
            importedAssetKey: importedKey,
            action: "link",
            manualUpdatedAt: manual.updatedAt.toISOString(),
          },
        ],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
    expect(audit).toEqual([
      [
        expect.objectContaining({
          manualAssetKey: manual.assetKey,
          importedAssetKey: importedKey,
          status: "LINK",
        }),
      ],
    ]);
  });
  it.each(["omitted", "stale"] as const)(
    "rejects a %s decision for a recomputed missing-code candidate",
    async (decisionState) => {
      const manual = {
        ...reconciliationManual,
        product: "CDB Banco Inter",
        assetCode: null,
        institution: "Banco Inter",
        updatedAt: new Date("2026-10-01T12:00:00Z"),
      };
      const importedPosition = {
        ...reconciliationPosition,
        product: "CDB - BANCO INTER S/A",
        assetCode: "CDBA266ZVZV",
        institution: "Banco Inter",
      };
      const { transaction } = reconciliationTransaction([manual]);
      const candidateDecision = {
        ...validDecision,
        importedAssetKey: getEmergencyReserveAssetKey(importedPosition),
        manualUpdatedAt: manual.updatedAt.toISOString(),
      };
      const suppliedDecisions =
        decisionState === "omitted"
          ? []
          : [
              {
                ...candidateDecision,
                manualUpdatedAt: "2026-09-01T00:00:00.000Z",
              },
            ];

      await expect(
        importRepository.create({
          ...reconciliationInput,
          positions: [importedPosition] as never,
          reconciliationDecisions: suppliedDecisions,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );
  it.each(["link", "separate"] as const)(
    "atomically appends %s audit events with the B3 snapshot",
    async (action) => {
      const { audit } = reconciliationTransaction();
      await importRepository.create(
        {
          ...reconciliationInput,
          reconciliationDecisions: [{ ...validDecision, action }],
        },
        "req",
      );
      expect(audit).toEqual([
        [
          {
            manualAssetKey: "manual:1",
            importedAssetKey: reconciliationKey,
            status: action === "link" ? "LINK" : "SEPARATE",
            effectiveFrom: "2026-09-30",
            recordedAt: expect.any(Date),
            requestId: "req",
            importId: "import",
            userId: "owner-1",
          },
        ],
      ]);
    },
  );
  it("records serialized decisions after the prior audit timestamp even if the local clock is behind", async () => {
    const previous: ReconciliationEvent = {
      id: "previous",
      manualAssetKey: "manual:1",
      importedAssetKey: reconciliationKey,
      status: "UNLINK",
      effectiveFrom: "2026-09-30",
      recordedAt: new Date("2099-01-01T00:00:00Z"),
    };
    const { audit } = reconciliationTransaction(undefined, [], [previous]);
    await importRepository.create({
      ...reconciliationInput,
      reconciliationDecisions: [validDecision],
    });
    const [next] = audit[0] as ReconciliationEvent[];
    expect(next.recordedAt).toEqual(
      new Date(new Date(previous.recordedAt).getTime() + 1),
    );
    expect(
      activeReconciliationLinks([previous, { ...next, id: "next" }]),
    ).toHaveLength(1);
  });
  it("rejects competing active links from another manual position across imports", async () => {
    reconciliationTransaction(
      undefined,
      [],
      [
        {
          id: "link",
          manualAssetKey: "manual:deleted",
          importedAssetKey: reconciliationKey,
          status: "LINK",
          effectiveFrom: "2026-09-01",
          recordedAt: new Date("2026-09-02"),
        },
      ],
    );
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  const sameClassification = {
    assetClass: "Renda variÃ¡vel",
    subClass: "AÃ§Ãµes",
    geography: "Brasil",
  };
  it.each(["assetClass", "subClass", "geography"] as const)(
    "rejects conflicting persisted %s classification before creating the snapshot",
    async (field) => {
      const { transaction } = reconciliationTransaction(
        undefined,
        [],
        [],
        [
          { assetKey: "manual:1", ...sameClassification },
          {
            assetKey: reconciliationKey,
            ...sameClassification,
            [field]: "different",
          },
        ],
      );
      await expect(
        importRepository.create({
          ...reconciliationInput,
          reconciliationDecisions: [validDecision],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );
  it("allows identical explicit classifications on both identities", async () => {
    reconciliationTransaction(
      undefined,
      [],
      [],
      [
        { assetKey: "manual:1", ...sameClassification },
        { assetKey: reconciliationKey, ...sameClassification },
      ],
    );
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
  });
  it("allows a link when only the manual classification is stored", async () => {
    reconciliationTransaction(
      undefined,
      [],
      [],
      [{ assetKey: "manual:1", ...sameClassification }],
    );
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
  });
  it("keeps separate broker decisions alongside one matching link", async () => {
    const second = { ...reconciliationPosition, institution: "Banco B" };
    reconciliationTransaction();
    await expect(
      importRepository.create({
        ...reconciliationInput,
        positions: [reconciliationPosition, second] as never,
        reconciliationDecisions: [
          validDecision,
          {
            ...validDecision,
            action: "separate",
            importedAssetKey: getEmergencyReserveAssetKey(second),
          },
        ],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
  });
  it("preserves matching objective ownership when linking", async () => {
    reconciliationTransaction(undefined, [
      { assetKey: "manual:1", objectiveId: "long" },
      { assetKey: reconciliationKey, objectiveId: "long" },
    ]);
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
  });
  it("rejects links that would orphan an imported objective assignment", async () => {
    const { transaction } = reconciliationTransaction(undefined, [
      { assetKey: reconciliationKey, objectiveId: "long" },
    ]);
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });
  it("rejects multiple links from the same manual position", async () => {
    reconciliationTransaction();
    const second = { ...reconciliationPosition, institution: "Banco B" };
    await expect(
      importRepository.create({
        ...reconciliationInput,
        positions: [reconciliationPosition, second] as never,
        reconciliationDecisions: [
          validDecision,
          {
            ...validDecision,
            importedAssetKey: getEmergencyReserveAssetKey(second),
          },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it("rejects multiple manual positions linked to one imported position", async () => {
    reconciliationTransaction([
      reconciliationManual,
      { ...reconciliationManual, assetKey: "manual:2" },
    ]);
    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [
          validDecision,
          { ...validDecision, manualAssetKey: "manual:2" },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
  it.each([
    {
      name: "an imported identity already linked to another manual position",
      event: {
        manualAssetKey: "manual:existing",
        importedAssetKey: reconciliationKey,
      },
    },
    {
      name: "a manual identity already linked to another imported position",
      event: {
        manualAssetKey: reconciliationManual.assetKey,
        importedAssetKey: "v1:" + "b".repeat(64),
      },
    },
  ])("rejects a link that conflicts with $name", async ({ event }) => {
    const { transaction } = reconciliationTransaction(
      undefined,
      [],
      [
        {
          id: "active-link",
          ...event,
          status: "LINK",
          effectiveFrom: "2026-09-01",
          recordedAt: new Date("2026-09-02T00:00:00Z"),
        },
      ],
    );

    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });
  it("does not reject the exact pair in the defensive active-link guard", async () => {
    mocks.forcedCandidates = [
      {
        manualAssetKey: validDecision.manualAssetKey,
        importedAssetKey: validDecision.importedAssetKey,
        manualUpdatedAt: validDecision.manualUpdatedAt,
      },
    ];
    mocks.forcedLinks = [
      {
        manualAssetKey: validDecision.manualAssetKey,
        importedAssetKey: validDecision.importedAssetKey,
        status: "LINK",
        effectiveFrom: "2026-09-01",
        recordedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ];
    const { transaction } = reconciliationTransaction();

    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot" });
    expect(transaction.insert).toHaveBeenCalled();
  });
  it("rejects a different imported pair for the same manual identity in the defensive guard", async () => {
    mocks.forcedCandidates = [
      {
        manualAssetKey: validDecision.manualAssetKey,
        importedAssetKey: validDecision.importedAssetKey,
        manualUpdatedAt: validDecision.manualUpdatedAt,
      },
    ];
    mocks.forcedLinks = [
      {
        manualAssetKey: validDecision.manualAssetKey,
        importedAssetKey: "v1:" + "b".repeat(64),
        status: "LINK",
        effectiveFrom: "2026-09-01",
        recordedAt: new Date("2026-09-02T00:00:00Z"),
      },
    ];
    const { transaction } = reconciliationTransaction();

    await expect(
      importRepository.create({
        ...reconciliationInput,
        reconciliationDecisions: [validDecision],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });
  it("checks import hash presence", async () => {
    mocks.client.select
      .mockReturnValueOnce(chain([{ id: "import-1" }]))
      .mockReturnValueOnce(chain([]));
    await expect(importRepository.existsByHash("hash")).resolves.toBe(true);
    await expect(importRepository.existsByHash("hash")).resolves.toBe(false);
  });
  it("scopes duplicate hash checks to the authenticated owner", async () => {
    const where = vi.fn().mockReturnValue({ limit: async () => [] });
    mocks.client.select.mockReturnValue({
      from: () => ({ where }),
    });
    await expect(
      importRepository.existsByHash("owner-file-hash"),
    ).resolves.toBe(false);
    expect(containsSqlParameter(where.mock.calls[0]?.[0], "owner-1")).toBe(
      true,
    );
  });
  it("updates one B3 reference date as both snapshot and estimation metadata", async () => {
    const changes: unknown[] = [];
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ id: "import-1" }] }),
        }),
      }),
      update: vi
        .fn()
        .mockImplementationOnce(() => ({
          set: (values: unknown) => {
            changes.push(values);
            return {
              where: () => ({
                returning: async () => [{ id: "snapshot-1" }],
              }),
            };
          },
        }))
        .mockImplementationOnce(() => ({
          set: (values: unknown) => {
            changes.push(values);
            return { where: async () => undefined };
          },
        })),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      importRepository.updatePositionReferenceDate(
        "same-file-hash",
        "2026-09-18",
        "request-1",
      ),
    ).resolves.toEqual({ importId: "import-1", snapshotId: "snapshot-1" });
    expect(changes).toEqual([
      { referenceDate: "2026-09-18", estimationBaseDate: "2026-09-18" },
      { referenceDate: "2026-09-18", estimationBaseDate: "2026-09-18" },
    ]);
  });

  it("does not update metadata when a duplicate has no position snapshot", async () => {
    const update = vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: async () => [] }),
      }),
    }));
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ id: "import-1" }] }),
        }),
      }),
      update,
    };
    mocks.client.transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      importRepository.updatePositionReferenceDate(
        "same-file-hash",
        "2026-09-18",
      ),
    ).resolves.toBeNull();
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not backfill a hash that is not a position import", async () => {
    const update = vi.fn();
    const tx = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
      update,
    };
    mocks.client.transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );

    await expect(
      importRepository.updatePositionReferenceDate(
        "movement-hash",
        "2026-09-18",
      ),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("logs and rethrows duplicate metadata update failures", async () => {
    mocks.client.transaction.mockRejectedValue(new Error("database failed"));

    await expect(
      importRepository.updatePositionReferenceDate(
        "same-file-hash",
        "2026-09-18",
        "request-2",
      ),
    ).rejects.toThrow("database failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_import_reference_date_update_failed",
      expect.objectContaining({ requestId: "request-2" }),
    );
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
  it("uses explicit tie-breakers for the latest snapshot and its positions", async () => {
    const snapshotOrdering = vi.fn();
    const positionOrdering = vi.fn();
    mocks.client.select
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: (...ordering: unknown[]) => {
              snapshotOrdering(...ordering);
              return {
                limit: async () => [{ id: "snapshot-1", referenceDate: null }],
              };
            },
          }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: (...ordering: unknown[]) => {
              positionOrdering(...ordering);
              return Promise.resolve([]);
            },
          }),
        }),
      } as never);

    await expect(importRepository.listLatestPositions()).resolves.toEqual([]);
    expect(snapshotOrdering).toHaveBeenCalledTimes(1);
    expect(snapshotOrdering.mock.calls[0]).toHaveLength(3);
    expect(positionOrdering).toHaveBeenCalledTimes(1);
    expect(positionOrdering.mock.calls[0]).toHaveLength(2);
  });
  it("creates import, snapshot and position items in one transaction", async () => {
    let persistedPositions: unknown[] = [];
    const persistedInputs: unknown[] = [];
    const transaction = { ...emptyImportGuard(), insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: (input: unknown) => {
          persistedInputs.push(input);
          return { returning: async () => [{ id: "import-1" }] };
        },
      })
      .mockReturnValueOnce({
        values: (input: unknown) => {
          persistedInputs.push(input);
          return {
            returning: async () => [{ id: "snapshot-1", importId: "import-1" }],
          };
        },
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
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.create({
        fileName: "b3.xlsx",
        fileHash: "hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-18",
        estimationBaseDate: "2026-09-18",
        positions,
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot-1" });
    expect(persistedInputs).toEqual([
      expect.objectContaining({
        estimationBaseDate: "2026-09-18",
        referenceDate: "2026-09-18",
      }),
      expect.objectContaining({
        estimationBaseDate: "2026-09-18",
        referenceDate: "2026-09-18",
      }),
    ]);
    expect(persistedPositions).toEqual([
      expect.objectContaining({
        userId: "owner-1",
        snapshotId: "snapshot-1",
        valuationSource: "CURVA",
        curveUnitPrice: "0.01059225",
        curveTotalValue: "3177.67",
      }),
    ]);
  });

  it("locks assignments and rejects an identity conflict that appeared after preview", async () => {
    const currentPosition = {
      product: "CDB Viagem",
      assetCode: "CDB-TRIP",
      institution: "Banco A",
      issuer: "Banco A",
      indexer: "CDI",
      regimeType: "PÃ“S",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [{ id: "snapshot-latest" }],
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [currentPosition] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [
              {
                assetKey: getEmergencyReserveAssetKey(currentPosition),
                objectiveId: "trip",
              },
            ],
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "trip", name: "Viagem" }] }),
        }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.create({
        fileName: "new.xlsx",
        fileHash: "new-hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-30",
        positions: [],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Viagem"),
    });
    expect(transaction.execute).toHaveBeenCalledTimes(2);
    const importLock = transaction.execute.mock.calls[0][0] as unknown as {
      queryChunks: unknown[];
    };
    expect(sqlChunksText(importLock.queryChunks)).toContain(
      "SHARE ROW EXCLUSIVE",
    );
    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.select.mock.invocationCallOrder[0],
    );
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("allows import when the latest snapshot contains no positions", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [{ id: "snapshot-empty" }],
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [] }),
        }),
      insert: vi.fn(),
    };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-2" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "snapshot-2" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [] }),
      });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.create({
        fileName: "empty.xlsx",
        fileHash: "empty-hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-30",
        positions: [],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot-2" });
    expect(transaction.insert).toHaveBeenCalledTimes(3);
  });

  it("allows import when prior positions have no objective assignments", async () => {
    const existingPosition = {
      product: "CDB livre",
      assetCode: "CDB-FREE",
      institution: "Banco A",
      issuer: "Banco A",
      indexer: "CDI",
      regimeType: "PÃ“S",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: async () => [{ id: "snapshot-old" }] }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [existingPosition] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [] }),
        }),
      insert: vi.fn(),
    };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-3" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "snapshot-3" }] }),
      })
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [] }),
      });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.create({
        fileName: "free.xlsx",
        fileHash: "free-hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-30",
        positions: [],
      }),
    ).resolves.toMatchObject({ snapshotId: "snapshot-3" });
    expect(transaction.insert).toHaveBeenCalledTimes(3);
  });

  it("returns a safe generic conflict when an assignment has no objective name", async () => {
    const currentPosition = {
      product: "CDB Ã³rfÃ£o",
      assetCode: "CDB-ORPHAN",
      institution: "Banco A",
      issuer: "Banco A",
      indexer: "CDI",
      regimeType: "PÃ“S",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: async () => [{ id: "snapshot-old" }] }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [currentPosition] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [
              {
                assetKey: getEmergencyReserveAssetKey(currentPosition),
                objectiveId: "deleted-objective",
              },
            ],
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [] }),
        }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.create({
        fileName: "conflict.xlsx",
        fileHash: "conflict-hash",
        documentType: "B3_POSITION_XLSX",
        referenceDate: "2026-09-30",
        positions: [],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("um objetivo"),
    });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("appends a new dated snapshot and retains the previous snapshot", async () => {
    const insertedSnapshots: Array<Record<string, unknown>> = [];
    let importSequence = 0;
    let insertSequence = 0;
    const transaction = {
      ...emptyImportGuard(),
      insert: vi.fn(() => {
        insertSequence += 1;
        const insertKind = ((insertSequence - 1) % 3) + 1;
        return {
          values: (value: unknown) => {
            if (insertKind === 2)
              insertedSnapshots.push(value as Record<string, unknown>);
            return {
              returning: async () => {
                if (insertKind === 1) {
                  importSequence += 1;
                  return [{ id: `import-${importSequence}` }];
                }
                if (insertKind === 2)
                  return [{ id: `snapshot-${importSequence}` }];
                return [{ id: `position-${importSequence}` }];
              },
            };
          },
        };
      }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );

    await importRepository.create({
      fileName: "b3.xlsx",
      fileHash: "first-hash",
      documentType: "B3_POSITION_XLSX",
      referenceDate: "2026-09-28",
      estimationBaseDate: "2026-09-28",
      positions,
    });
    await importRepository.create({
      fileName: "b3-updated.xlsx",
      fileHash: "second-hash",
      documentType: "B3_POSITION_XLSX",
      referenceDate: "2026-09-29",
      estimationBaseDate: "2026-09-29",
      positions,
    });

    expect(insertedSnapshots).toEqual([
      expect.objectContaining({
        referenceDate: "2026-09-28",
        estimationBaseDate: "2026-09-28",
      }),
      expect.objectContaining({
        referenceDate: "2026-09-29",
        estimationBaseDate: "2026-09-29",
      }),
    ]);
    expect(mocks.client.transaction).toHaveBeenCalledTimes(2);
  });

  it("persists a new liquidity fact with its source position and snapshot", async () => {
    const persistedFacts: unknown[][] = [];
    const transaction = { ...emptyImportGuard(), insert: vi.fn() };
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
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
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
    const transaction = { ...emptyImportGuard(), insert: vi.fn() };
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
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
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
    await expect(importRepository.listLatestPositions()).resolves.toMatchObject(
      [
        {
          product: "Ativo",
          quantity: "1",
          referenceDate: undefined,
          estimationBaseDate: undefined,
          [Symbol.for("investlab.positionSnapshotId")]: "snapshot-1",
        },
      ],
    );
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

    await expect(importRepository.listLatestPositions()).resolves.toMatchObject(
      [
        {
          ...position,
          referenceDate: "2026-09-28",
          estimationBaseDate: undefined,
          [Symbol.for("investlab.positionSnapshotId")]: "snapshot-1",
          liquidityProfile: { ...fact, rule },
        },
      ],
    );
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

    await expect(importRepository.listLatestPositions()).resolves.toMatchObject(
      [
        {
          ...position,
          referenceDate: "2026-09-28",
          estimationBaseDate: undefined,
          [Symbol.for("investlab.positionSnapshotId")]: "snapshot-1",
          liquidityProfile: { ...fact, rule: null },
        },
      ],
    );
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
    const transaction = { ...emptyImportGuard(), insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "import-1" }] }),
      })
      .mockReturnValueOnce({ values: persistMovements });
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.create({
        fileName: "movements.xlsx",
        fileHash: "movement-hash",
        documentType: "B3_MOVEMENT_XLSX",
        movements: [
          {
            sourceRow: 2,
            eventFingerprint: "a".repeat(32),
            direction: "CREDITO",
            occurredAt: "2026-09-11",
            movementType: "APLICAÃ‡ÃƒO",
            product: "CDB",
            assetCode: null,
            originalAssetCode: null,
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
  });

  it("persists negotiation rows as source records without creating snapshots", async () => {
    const persistedTrades = vi.fn().mockResolvedValue(undefined);
    const transaction = { ...emptyImportGuard(), insert: vi.fn() };
    transaction.insert
      .mockReturnValueOnce({
        values: () => ({ returning: async () => [{ id: "trade-import" }] }),
      })
      .mockReturnValueOnce({ values: persistedTrades });
    mocks.client.transaction.mockImplementation((callback) =>
      callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.create({
        fileName: "trades.xlsx",
        fileHash: "trade-hash",
        documentType: "B3_TRADING_XLSX",
        trades: [
          {
            side: "BUY",
            tradingDate: "2026-10-14",
            settlementDate: null,
            movementType: "Compra",
            market: null,
            product: "ABCD3",
            assetCode: "ABCD3",
            originalAssetCode: "ABCD3F",
            institution: null,
            quantity: "2",
            unitPrice: "10",
            grossValue: "20",
            fees: null,
            sourceRow: 2,
            identityFingerprint: "f".repeat(64),
          },
        ],
      }),
    ).resolves.toEqual({ importId: "trade-import" });

    expect(transaction.insert).toHaveBeenCalledWith(tradingItems);
    expect(persistedTrades).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "owner-1",
        importId: "trade-import",
        identityFingerprint: "f".repeat(64),
        sourceRow: 2,
      }),
    ]);
    expect(transaction.insert).not.toHaveBeenCalledWith(positionSnapshots);
  });

  it("preserves the original B3 row and inserts a divergent reimport row as a distinct source", async () => {
    const insertedMovementRows: unknown[][] = [];
    let importNumber = 0;
    const transaction = {
      insert: vi.fn((table: unknown) =>
        table === imports
          ? {
              values: () => ({
                returning: async () => [
                  { id: `movement-import-${++importNumber}` },
                ],
              }),
            }
          : {
              values: (rows: unknown[]) => {
                insertedMovementRows.push(rows);
                return undefined;
              },
            },
      ),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const base = {
      sourceRow: 2,
      direction: "CREDITO" as const,
      occurredAt: "2026-10-01",
      movementType: "Compra",
      product: "Empresa Exemplo - EXMP3",
      assetCode: "EXMP3",
      originalAssetCode: "EXMP3",
      institution: "Corretora",
      quantity: "2",
      unitPrice: "10.25",
      operationValue: "20.50",
    };
    const originalMovement = prepareB3MovementForPersistence(base);
    const changedMovement = prepareB3MovementForPersistence({
      ...base,
      unitPrice: "12.00",
      operationValue: "24.00",
    });
    await importRepository.create({
      fileName: "original.xlsx",
      fileHash: "a".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [originalMovement],
    });
    await importRepository.create({
      fileName: "reimport.xlsx",
      fileHash: "b".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [changedMovement],
    });
    await importRepository.create({
      fileName: "overlap.xlsx",
      fileHash: "c".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [originalMovement],
    });

    expect(insertedMovementRows).toEqual([
      [
        expect.objectContaining({
          importId: "movement-import-1",
          unitPrice: "10.25",
          eventFingerprint: originalMovement.eventFingerprint,
        }),
      ],
      [
        expect.objectContaining({
          importId: "movement-import-2",
          unitPrice: "12.00",
          operationValue: "24.00",
          eventFingerprint: changedMovement.eventFingerprint,
        }),
      ],
      [
        expect.objectContaining({
          importId: "movement-import-3",
          eventFingerprint: originalMovement.eventFingerprint,
        }),
      ],
    ]);
    expect(originalMovement.eventFingerprint).not.toBe(
      changedMovement.eventFingerprint,
    );
    expect(transaction.insert).toHaveBeenCalledWith(movementItems);
  });

  it("lists movements and logs movement-query failures", async () => {
    mocks.client.select.mockReturnValue({
      from: () => ({
        where: () => ({ orderBy: async () => [{ id: "movement-1" }] }),
      }),
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
  it("lists trading rows and reconciliation events and logs read failures", async () => {
    mocks.client.select.mockReturnValue({
      from: () => ({
        where: () => ({ orderBy: async () => [{ id: "trade-1" }] }),
      }),
    });
    await expect(importRepository.listTradingItems()).resolves.toEqual([
      { id: "trade-1" },
    ]);
    mocks.client.select.mockImplementation(() => {
      throw new Error("trading read failed");
    });
    await expect(
      importRepository.listTradingItems("request-1"),
    ).rejects.toThrow("trading read failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_trading_items_query_failed",
      expect.any(Object),
    );
    mocks.client.select.mockReturnValue({
      from: () => ({
        where: () => ({ orderBy: async () => [{ id: "event-1" }] }),
      }),
    });
    await expect(
      importRepository.listB3ReconciliationEvents(),
    ).resolves.toEqual([{ id: "event-1" }]);
    mocks.client.select.mockImplementation(() => {
      throw new Error("event read failed");
    });
    await expect(
      importRepository.listB3ReconciliationEvents("request-2"),
    ).rejects.toThrow("event read failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_b3_reconciliation_events_query_failed",
      expect.any(Object),
    );
  });

  it("persists reconciliation decisions for user-owned rows and rejects conflicting links", async () => {
    const tradeId = "11111111-1111-4111-8111-111111111111";
    const movementId = "22222222-2222-4222-8222-222222222222";
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: tradeId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: movementId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ orderBy: async () => [] }) }),
        }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.saveB3ReconciliationDecisions([
        { tradeId, movementId, action: "LINK" },
      ]),
    ).resolves.toBe(1);
    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "owner-1",
        tradingItemId: tradeId,
        movementItemId: movementId,
        status: "LINK",
      }),
    ]);

    const conflictingTransaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: tradeId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: movementId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  tradingItemId: "33333333-3333-4333-8333-333333333333",
                  movementItemId: movementId,
                  status: "LINK",
                  eventOrder: 1,
                },
              ],
            }),
          }),
        }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof conflictingTransaction) => unknown) =>
        callback(conflictingTransaction),
    );
    await expect(
      importRepository.saveB3ReconciliationDecisions([
        { tradeId, movementId, action: "LINK" },
      ]),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(conflictingTransaction.insert).not.toHaveBeenCalled();
  });

  it("records an empty reconciliation batch without inserting events", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ orderBy: async () => [] }) }),
        }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(transaction),
    );

    await expect(
      importRepository.saveB3ReconciliationDecisions([]),
    ).resolves.toBe(0);
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("does not reject an idempotent link for the same trade and movement", async () => {
    const tradeId = "11111111-1111-4111-8111-111111111111";
    const movementId = "22222222-2222-4222-8222-222222222222";
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: tradeId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: movementId }] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  tradingItemId: tradeId,
                  movementItemId: movementId,
                  status: "LINK",
                  eventOrder: 1,
                },
              ],
            }),
          }),
        }),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(transaction),
    );

    await expect(
      importRepository.saveB3ReconciliationDecisions([
        { tradeId, movementId, action: "LINK" },
      ]),
    ).resolves.toBe(1);
    expect(insertValues).toHaveBeenCalledOnce();
  });

  it("rejects reconciliation decisions for rows owned by another user and logs database failures", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ orderBy: async () => [] }) }),
        }),
      insert: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    await expect(
      importRepository.saveB3ReconciliationDecisions([
        {
          tradeId: "11111111-1111-4111-8111-111111111111",
          movementId: "22222222-2222-4222-8222-222222222222",
          action: "KEEP_SEPARATE",
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 409 });
    mocks.client.transaction.mockRejectedValue(new Error("write failed"));
    await expect(
      importRepository.saveB3ReconciliationDecisions([]),
    ).rejects.toThrow("write failed");
    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_b3_reconciliation_save_failed",
      expect.any(Object),
    );
  });
  it("deletes movement imports and their items", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-row" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.delete).toHaveBeenCalledTimes(2);
  });

  it("preserves a B3 movement import when any of its rows has reconciliation history", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-row" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: async () => [{ id: "link-event" }] }),
          }),
        }),
      delete: vi.fn(),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX"),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Preserve o arquivo importado"),
    });
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("preserves movement imports linked to a negotiation", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "movement-row" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: async () => [{ id: "trade-link" }] }),
          }),
        }),
      delete: vi.fn(),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX", "request"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes a movement import with no movement rows", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ id: "empty-movement-import" }],
          }),
        })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) }),
      delete: vi.fn().mockReturnValue({ where: async () => undefined }),
    };
    mocks.client.transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_MOVEMENT_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.select).toHaveBeenCalledTimes(2);
  });

  it("deletes negotiation source rows only when they have no reconciliation event", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "trade-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "trade-row" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.deleteByDocumentType("B3_TRADING_XLSX", "request"),
    ).resolves.toBe(1);

    expect(transaction.delete).toHaveBeenCalledWith(tradingItems);
    expect(transaction.delete).toHaveBeenCalledWith(imports);
  });

  it("preserves negotiation imports with reconciliation history", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "trade-import" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "trade-row" }] }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: async () => [{ id: "reconciliation" }] }),
          }),
        }),
      delete: vi.fn(),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.deleteByDocumentType("B3_TRADING_XLSX", "request"),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Remova o vínculo"),
    });
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes a negotiation import that has no parsed source rows", async () => {
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: async () => [{ id: "empty-trade-import" }] }),
        })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) }),
      delete: vi.fn().mockReturnValue({ where: async () => undefined }),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(withManualRead(transaction)),
    );

    await expect(
      importRepository.deleteByDocumentType("B3_TRADING_XLSX", "request"),
    ).resolves.toBe(1);
    expect(transaction.select).toHaveBeenCalledTimes(2);
  });

  it("deletes position items, snapshots and imports", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
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
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
    );
    await expect(
      importRepository.deleteByDocumentType("B3_POSITION_XLSX"),
    ).resolves.toBe(1);
    expect(transaction.delete).toHaveBeenCalledTimes(3);
  });

  it("removes a position import even when its snapshot is absent", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
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
      (callback: (tx: typeof transaction) => unknown) =>
        callback(withManualRead(transaction)),
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

  it("deletes only a B3 position from the latest snapshot", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [{ id: "latest-snapshot" }],
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: "position-1", source: "B3" }],
            }),
          }),
        }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(transaction),
    );

    await expect(
      importRepository.deleteLatestPosition("position-1", "request-1"),
    ).resolves.toBe(1);

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(transaction.delete).toHaveBeenCalledWith(positionItems);
    expect(where).toHaveBeenCalledOnce();
  });

  it("rejects position deletion when there is no latest snapshot or the item is not B3 in that snapshot", async () => {
    const makeTransaction = (
      snapshots: unknown[],
      positions: unknown[] = [],
    ) => ({
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: async () => snapshots }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => positions }) }),
        }),
      delete: vi.fn(),
    });

    const noSnapshot = makeTransaction([]);
    mocks.client.transaction.mockImplementationOnce((callback) =>
      callback(noSnapshot),
    );
    await expect(
      importRepository.deleteLatestPosition("position-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(noSnapshot.delete).not.toHaveBeenCalled();

    const missingPosition = makeTransaction([{ id: "latest-snapshot" }]);
    mocks.client.transaction.mockImplementationOnce((callback) =>
      callback(missingPosition),
    );
    await expect(
      importRepository.deleteLatestPosition("position-1"),
    ).rejects.toMatchObject({ statusCode: 404 });

    const manualPosition = makeTransaction(
      [{ id: "latest-snapshot" }],
      [{ id: "position-1", source: "MANUAL" }],
    );
    mocks.client.transaction.mockImplementationOnce((callback) =>
      callback(manualPosition),
    );
    await expect(
      importRepository.deleteLatestPosition("position-1"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(manualPosition.delete).not.toHaveBeenCalled();
  });

  it("logs unexpected position deletion failures and rethrows them", async () => {
    mocks.client.transaction.mockRejectedValueOnce(new Error("lock failed"));

    await expect(
      importRepository.deleteLatestPosition("position-1", "request-1"),
    ).rejects.toThrow("lock failed");

    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_position_item_deletion_failed",
      expect.objectContaining({ requestId: "request-1" }),
    );
  });

  it("deletes a movement only when it exists and has no reconciliation history", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({ limit: async () => [{ id: "movement-1" }] }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        }),
      delete: vi.fn().mockReturnValue({ where }),
    };
    mocks.client.transaction.mockImplementation((callback) =>
      callback(transaction),
    );

    await expect(
      importRepository.deleteUnreconciledMovement("movement-1", "request-1"),
    ).resolves.toBe(1);

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(transaction.delete).toHaveBeenCalledWith(movementItems);
    expect(where).toHaveBeenCalledOnce();
  });

  it("rejects a missing or reconciled movement without deleting it", async () => {
    const makeTransaction = (
      movementRows: unknown[],
      events: unknown[] = [],
    ) => ({
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => movementRows }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: async () => events }) }),
        }),
      delete: vi.fn(),
    });

    const missing = makeTransaction([]);
    mocks.client.transaction.mockImplementationOnce((callback) =>
      callback(missing),
    );
    await expect(
      importRepository.deleteUnreconciledMovement("movement-1"),
    ).rejects.toMatchObject({ statusCode: 404 });

    const reconciled = makeTransaction(
      [{ id: "movement-1" }],
      [{ id: "event-1" }],
    );
    mocks.client.transaction.mockImplementationOnce((callback) =>
      callback(reconciled),
    );
    await expect(
      importRepository.deleteUnreconciledMovement("movement-1"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(reconciled.delete).not.toHaveBeenCalled();
  });

  it("logs unexpected movement deletion failures and rethrows them", async () => {
    mocks.client.transaction.mockRejectedValueOnce(new Error("lock failed"));

    await expect(
      importRepository.deleteUnreconciledMovement("movement-1", "request-1"),
    ).rejects.toThrow("lock failed");

    expect(mocks.logger.error).toHaveBeenCalledWith(
      "database_movement_item_deletion_failed",
      expect.objectContaining({ requestId: "request-1" }),
    );
  });
  it("persists successive complete snapshots and returns only the latest items", async () => {
    const persisted: unknown[][] = [];
    let importNumber = 0;
    mocks.client.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => {
        importNumber += 1;
        const transaction = { ...emptyImportGuard(), insert: vi.fn() };
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
        return callback(withManualRead(transaction));
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
    await expect(importRepository.listLatestPositions()).resolves.toMatchObject(
      secondSnapshot.map((position) => ({
        ...position,
        referenceDate: undefined,
        estimationBaseDate: undefined,
        [Symbol.for("investlab.positionSnapshotId")]: "snapshot-2",
      })),
    );
  });
});
