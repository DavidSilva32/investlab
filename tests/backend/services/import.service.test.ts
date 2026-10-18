import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parser = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  existsByHash: vi.fn(),
  getPositionImportReferenceDateByHash: vi.fn(),
  updatePositionReferenceDate: vi.fn(),
  listLatestPositions: vi.fn(),
  listTradingItems: vi.fn(),
  listMovements: vi.fn(),
  listB3ReconciliationEvents: vi.fn(),
  saveB3ReconciliationDecisions: vi.fn(),
  create: vi.fn(),
  deleteByDocumentType: vi.fn(),
  deleteLatestPosition: vi.fn(),
  deleteUnreconciledMovement: vi.fn(),
}));
const manual = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/backend/repositories/manual-portfolio-position.repository", () => ({
  manualPortfolioPositionRepository: manual,
}));
const objectives = vi.hoisted(() => ({ list: vi.fn() }));
const reconciliation = vi.hoisted(() => ({ listEvents: vi.fn() }));
vi.mock("@/backend/repositories/position-reconciliation.repository", () => ({
  positionReconciliationRepository: reconciliation,
}));
vi.mock("@/backend/services/b3-xlsx-parser", () => ({ parseB3Xlsx: parser }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: objectives,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { importService } from "@/backend/services/import.service";
import { createB3TradeIdentityFingerprint } from "@/backend/services/b3-trading-fingerprint";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";

beforeEach(() => {
  vi.clearAllMocks();
  manual.list.mockResolvedValue([]);
  reconciliation.listEvents.mockResolvedValue([]);
  repository.listLatestPositions.mockResolvedValue([]);
  repository.listTradingItems.mockResolvedValue([]);
  repository.listMovements.mockResolvedValue([]);
  repository.listB3ReconciliationEvents.mockResolvedValue([]);
  repository.getPositionImportReferenceDateByHash.mockResolvedValue({
    referenceDate: null,
    needsSelection: false,
    conflict: false,
  });
  objectives.list.mockResolvedValue({ objectives: [], assignments: [] });
});

describe("ImportService", () => {
  const file = {
    name: "b3.xlsx",
    size: 3,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("b3"),
  };

  it("creates a deterministic SHA-256 preview for positions", () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "Ativo", quantity: "1" }],
    });
    expect(importService.preview(file)).toEqual({
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "Ativo", quantity: "1" }],
    });
  });

  it("keeps the detected movement document in its preview", () => {
    parser.mockReturnValue({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB", quantity: "1" }],
    });
    expect(importService.preview(file)).toMatchObject({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }],
    });
  });

  it("marks trade history incomplete and preserves duplicate source occurrences", () => {
    parser.mockReturnValue({
      documentType: "B3_TRADING_XLSX",
      trades: [
        {
          side: "BUY",
          tradingDate: "2026-10-14",
          settlementDate: null,
          movementType: "Compra",
          market: "Vista",
          product: "BBSE3F",
          assetCode: "BBSE3",
          originalAssetCode: "BBSE3F",
          institution: "Corretora",
          quantity: "1",
          unitPrice: "20",
          grossValue: "20",
          fees: null,
          sourceRow: 2,
        },
        {
          side: "BUY",
          tradingDate: "2026-10-14",
          settlementDate: null,
          movementType: "Compra",
          market: "Vista",
          product: "BBSE3F",
          assetCode: "BBSE3",
          originalAssetCode: "BBSE3F",
          institution: "Corretora",
          quantity: "1",
          unitPrice: "20",
          grossValue: "20",
          fees: null,
          sourceRow: 3,
        },
      ],
    });
    const preview = importService.preview(file);
    expect(preview).toMatchObject({
      documentType: "B3_TRADING_XLSX",
      history: { complete: false },
      duplicateCandidates: [
        {
          sourceRows: [2, 3],
          existingCount: 0,
          occurrenceCount: 2,
          status: "ambiguous",
        },
      ],
      batchReconciliationPending: true,
    });
  });

  it("includes existing negotiation occurrences in duplicate review counts", async () => {
    const parsedTrade = {
      side: "BUY" as const,
      tradingDate: "2026-10-14",
      settlementDate: null,
      movementType: "Compra",
      market: null,
      product: "ABCD3",
      assetCode: "ABCD3",
      originalAssetCode: "ABCD3F",
      institution: null,
      quantity: "1",
      unitPrice: "20",
      grossValue: "20",
      fees: null,
      sourceRow: 2,
    };
    parser.mockReturnValue({
      documentType: "B3_TRADING_XLSX",
      trades: [parsedTrade],
    });
    const fingerprint = createB3TradeIdentityFingerprint(parsedTrade);
    repository.listTradingItems.mockResolvedValue([
      {
        id: "existing-trade",
        identityFingerprint: fingerprint,
      },
      {
        identityFingerprint: fingerprint,
      },
      {
        id: "different-trade",
        identityFingerprint: "a-different-identity",
      },
    ]);

    const preview = await importService.previewWithIdentityConflicts(
      file,
      "request-trading-duplicates",
    );

    expect(preview).toMatchObject({
      duplicateCandidates: [
        { sourceRows: [2], existingCount: 1, occurrenceCount: 3 },
      ],
    });
  });

  it("exposes reconciliation after movement and trading imports are persisted", async () => {
    repository.listTradingItems.mockResolvedValue([
      {
        id: "trade-1",
        importId: "import-1",
        sourceRow: 2,
        identityFingerprint: "fingerprint-1",
        side: "BUY",
        tradingDate: "2026-10-14",
        assetCode: "BBSE3",
        institution: "Corretora",
        quantity: "1",
        grossValue: "20",
      },
    ]);
    repository.listMovements.mockResolvedValue([
      {
        id: "movement-1",
        direction: "CREDITO",
        occurredAt: "2026-10-16",
        movementType: "Transferência - Liquidação",
        assetCode: "BBSE3",
        institution: "Corretora",
        quantity: "1",
        operationValue: "20",
      },
    ]);
    const summary = await importService.reconciliationSummary("request-1");
    expect(summary).toMatchObject({
      candidates: [
        { tradeId: "trade-1", movementId: "movement-1", status: "candidate" },
      ],
      confirmed: [],
      history: { complete: false },
    });
  });

  it("returns movement previews without querying position assignments", async () => {
    parser.mockReturnValue({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB", quantity: "1" }],
    });

    await expect(
      importService.previewWithIdentityConflicts(file, "request-movement"),
    ).resolves.toMatchObject({ documentType: "B3_MOVEMENT_XLSX" });
    expect(repository.listLatestPositions).not.toHaveBeenCalled();
    expect(objectives.list).not.toHaveBeenCalled();
  });

  it("previews a position file with no same-hash import and no persisted date", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: null,
      needsSelection: false,
      conflict: false,
    });

    const preview = await importService.previewWithIdentityConflicts(
      file,
      "request-position-preview",
    );

    expect(preview).toMatchObject({
      documentType: "B3_POSITION_XLSX",
      reconciliationCandidates: [],
      identityConflicts: [],
    });
    expect(preview).not.toHaveProperty("duplicateImportMessage");
    expect(
      repository.getPositionImportReferenceDateByHash,
    ).not.toHaveBeenCalled();
  });

  it("explains when an identical position file can enrich its existing snapshot", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: "2026-09-30",
      needsSelection: false,
      conflict: false,
    });

    const preview = await importService.previewWithIdentityConflicts(
      file,
      "request-position-preview",
    );

    expect(preview).toMatchObject({
      duplicateImportMessage: expect.stringContaining(
        "Este arquivo idêntico já foi importado",
      ),
      existingReferenceDate: "2026-09-30",
    });
    expect(
      repository.getPositionImportReferenceDateByHash,
    ).toHaveBeenCalledWith(preview.hash);
  });

  it("asks for the B3 date when a legacy duplicate has no persisted dates", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: null,
      needsSelection: true,
      conflict: false,
    });

    const preview = await importService.previewWithIdentityConflicts(
      file,
      "request-position-preview",
    );

    expect(preview).toMatchObject({
      existingReferenceDate: null,
      referenceDateNeedsSelection: true,
      referenceDateConflict: false,
    });
  });

  it("rejects duplicate confirmation", () => {
    expect(() => importService.assertCanBeConfirmed(true)).toThrow(
      ApplicationError,
    );
    expect(() => importService.assertCanBeConfirmed(false)).not.toThrow();
  });

  it("uses the SHA-256 hash to identify an identical file", () => {
    parser.mockReturnValue({ documentType: "B3_POSITION_XLSX", positions: [] });
    const sameFile = { ...file, buffer: Buffer.from("b3") };
    const otherFile = { ...file, buffer: Buffer.from("different") };
    expect(importService.preview(file).hash).toBe(
      importService.preview(sameFile).hash,
    );
    expect(importService.preview(file).hash).not.toBe(
      importService.preview(otherFile).hash,
    );
  });
});

const persistenceFile = {
  name: "b3.xlsx",
  size: 3,
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  buffer: Buffer.from("b3"),
};

describe("ImportService persistence", () => {
  it("rejects identical files even with a new date without rewriting historical references", async () => {
    parser.mockReturnValue({ documentType: "B3_POSITION_XLSX", positions: [] });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: "2026-09-30",
      needsSelection: false,
      conflict: false,
    });
    await expect(
      importService.confirm(persistenceFile, "same-file", "2026-10-31"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updatePositionReferenceDate).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("confirms non-duplicate files and deletes valid document types", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
      estimationBaseDate: "2026-09-16",
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "import-1" });
    repository.deleteByDocumentType.mockResolvedValue(1);

    await expect(
      importService.confirm(persistenceFile, "request-1", "2026-09-18"),
    ).resolves.toMatchObject({
      result: { importId: "import-1" },
      duplicate: false,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDate: "2026-09-18",
        estimationBaseDate: "2026-09-18",
      }),
      "request-1",
    );
    await expect(
      importService.delete("B3_POSITION_XLSX", "request-1"),
    ).resolves.toBe(1);
    expect(repository.deleteByDocumentType).toHaveBeenCalledWith(
      "B3_POSITION_XLSX",
      "request-1",
    );
  });

  it("reuses the persisted B3 reference date when confirming an identical file without a new date", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
      estimationBaseDate: "2026-09-16",
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: "2026-09-30",
      needsSelection: false,
      conflict: false,
    });
    repository.create.mockResolvedValue({
      importId: "original-import",
      snapshotId: "original-snapshot",
      enrichedPositionCount: 0,
    });

    await expect(
      importService.confirm(persistenceFile, "request-duplicate"),
    ).resolves.toMatchObject({
      duplicate: true,
      reprocessedExistingImport: true,
      result: { enrichedPositionCount: 0 },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDate: "2026-09-30",
        reprocessExistingImport: true,
      }),
      "request-duplicate",
    );
  });

  it("requires a selected B3 date for a null-dated duplicate and persists it through enrichment", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
      estimationBaseDate: "2026-09-16",
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: null,
      needsSelection: true,
      conflict: false,
    });
    repository.create.mockResolvedValue({
      importId: "original-import",
      snapshotId: "original-snapshot",
      enrichedPositionCount: 0,
      referenceDateUpdated: true,
    });

    await expect(
      importService.confirm(persistenceFile, "request-duplicate"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();

    await expect(
      importService.confirm(persistenceFile, "request-duplicate", "2026-09-30"),
    ).resolves.toMatchObject({
      duplicate: true,
      reprocessedExistingImport: true,
      referenceDateUpdated: true,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDate: "2026-09-30",
        estimationBaseDate: "2026-09-30",
        reprocessExistingImport: true,
      }),
      "request-duplicate",
    );
  });

  it("rejects a legacy duplicate whose persisted dates conflict", async () => {
    parser.mockReturnValue({ documentType: "B3_POSITION_XLSX", positions: [] });
    repository.existsByHash.mockResolvedValue(true);
    repository.getPositionImportReferenceDateByHash.mockResolvedValue({
      referenceDate: null,
      needsSelection: false,
      conflict: true,
    });

    await expect(
      importService.confirm(persistenceFile, "request-duplicate", "2026-09-30"),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("confirms trades as source records with stable identity fingerprints", async () => {
    parser.mockReturnValue({
      documentType: "B3_TRADING_XLSX",
      trades: [
        {
          side: "BUY",
          tradingDate: "2026-10-14",
          settlementDate: null,
          movementType: "Compra",
          market: "Vista",
          product: "BBSE3F",
          assetCode: "BBSE3",
          originalAssetCode: "BBSE3F",
          institution: "Corretora",
          quantity: "1",
          unitPrice: "20",
          grossValue: "20",
          fees: null,
          sourceRow: 2,
        },
      ],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "import-trade" });

    await importService.confirm(persistenceFile, "request-trade");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: "B3_TRADING_XLSX",
        trades: [
          expect.objectContaining({
            sourceRow: 2,
            originalAssetCode: "BBSE3F",
            identityFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
      }),
      "request-trade",
    );
  });

  it("requires current candidate pairs before persisting reconciliation choices", async () => {
    repository.listTradingItems.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        importId: "import-1",
        sourceRow: 2,
        identityFingerprint: "fingerprint-1",
        side: "BUY",
        tradingDate: "2026-10-14",
        assetCode: "BBSE3",
        institution: "Corretora",
        quantity: "1",
        grossValue: "20",
      },
    ]);
    repository.listMovements.mockResolvedValue([
      {
        id: "22222222-2222-4222-8222-222222222222",
        direction: "CREDITO",
        occurredAt: "2026-10-16",
        movementType: "Transferência - Liquidação",
        assetCode: "BBSE3",
        institution: "Corretora",
        quantity: "1",
        operationValue: "20",
      },
    ]);
    repository.saveB3ReconciliationDecisions.mockResolvedValue(1);

    await expect(
      importService.saveReconciliationDecisions(
        {
          decisions: [
            {
              tradeId: "11111111-1111-4111-8111-111111111111",
              movementId: "22222222-2222-4222-8222-222222222222",
              action: "LINK",
            },
          ],
        },
        "request-link",
      ),
    ).resolves.toMatchObject({ confirmed: [] });
    expect(repository.saveB3ReconciliationDecisions).toHaveBeenCalledWith(
      [
        {
          tradeId: "11111111-1111-4111-8111-111111111111",
          movementId: "22222222-2222-4222-8222-222222222222",
          action: "LINK",
        },
      ],
      "request-link",
    );
    await expect(
      importService.saveReconciliationDecisions(
        { decisions: [] },
        "request-empty",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(["ambiguous", "confirmed"] as const)(
    "accepts a current pair from the %s reconciliation group",
    async (group) => {
      const currentTradeId = "11111111-1111-4111-8111-111111111111";
      const currentMovementId = "22222222-2222-4222-8222-222222222222";
      const otherMovementId = "44444444-4444-4444-8444-444444444444";
      repository.listTradingItems.mockResolvedValue([
        {
          id: currentTradeId,
          importId: "import-1",
          sourceRow: 2,
          identityFingerprint: "trade-fingerprint",
          side: "BUY",
          tradingDate: "2026-10-14",
          assetCode: "ABCD3",
          institution: "Corretora",
          quantity: "1",
          grossValue: "20",
        },
      ]);
      repository.listMovements.mockResolvedValue([
        {
          id: currentMovementId,
          direction: "CREDITO",
          occurredAt: "2026-10-16",
          movementType: "Transferência - Liquidação",
          assetCode: "ABCD3",
          institution: "Corretora",
          quantity: "1",
          operationValue: "20",
        },
        ...(group === "ambiguous"
          ? [
              {
                id: otherMovementId,
                direction: "CREDITO",
                occurredAt: "2026-10-16",
                movementType: "Transferência - Liquidação",
                assetCode: "ABCD3",
                institution: "Corretora",
                quantity: "1",
                operationValue: "20",
              },
            ]
          : []),
      ]);
      if (group === "confirmed")
        repository.listB3ReconciliationEvents.mockResolvedValue([
          {
            tradingItemId: currentTradeId,
            movementItemId: currentMovementId,
            status: "LINK",
            eventOrder: 1,
          },
        ]);
      repository.saveB3ReconciliationDecisions.mockResolvedValue(1);

      await expect(
        importService.saveReconciliationDecisions(
          {
            decisions: [
              {
                tradeId: currentTradeId,
                movementId: currentMovementId,
                action: "LINK",
              },
            ],
          },
          `request-${group}`,
        ),
      ).resolves.toBeDefined();
      expect(repository.saveB3ReconciliationDecisions).toHaveBeenCalledOnce();
    },
  );

  it("blocks confirmation when an assigned B3 identity disappears and reports field differences", async () => {
    const previous = {
      product: "CDB Banco A",
      institution: "Banco A",
      issuer: "Banco A",
      assetCode: "CDB1",
      indexer: "CDI",
      regimeType: "PÓS",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
      quantity: "1",
      totalValue: "100",
    };
    const incoming = { ...previous, institution: "Banco B" };
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [incoming],
    });
    repository.listLatestPositions.mockResolvedValue([previous]);
    objectives.list.mockResolvedValue({
      objectives: [{ id: "trip", name: "Viagem" }],
      assignments: [
        {
          assetKey: getEmergencyReserveAssetKey(previous),
          objectiveId: "trip",
        },
      ],
    });

    const preview = await importService.previewWithIdentityConflicts(
      persistenceFile,
      "request-preview",
    );

    expect(preview).toMatchObject({
      identityConflicts: [
        {
          objectiveName: "Viagem",
          position: expect.objectContaining({ product: "CDB Banco A" }),
          possibleIncomingDifferences: [
            {
              position: expect.objectContaining({ institution: "Banco B" }),
              changedFields: ["instituição: Banco A → Banco B"],
            },
          ],
        },
      ],
    });
    await expect(
      importService.confirm(persistenceFile, "request-confirm", "2026-09-28"),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Viagem"),
    });
    expect(repository.existsByHash).toHaveBeenCalledTimes(2);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("keeps objective assignments when a new snapshot retains the same position identity", async () => {
    const assigned = {
      product: "CDB Banco A",
      institution: "Banco A",
      issuer: "Banco A",
      assetCode: "CDB1",
      indexer: "CDI",
      regimeType: "PÓS",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
      quantity: "1",
      totalValue: "100",
    };
    const { totalValue: _nextValue, ...nextIdentity } = {
      ...assigned,
      totalValue: "101",
    };
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [{ ...assigned, totalValue: "101" }],
    });
    repository.listLatestPositions.mockResolvedValue([assigned]);
    objectives.list.mockResolvedValue({
      objectives: [{ id: "trip", name: "Viagem" }],
      assignments: [
        {
          assetKey: getEmergencyReserveAssetKey(assigned),
          objectiveId: "trip",
        },
      ],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "new-import" });

    const result = await importService.confirm(
      persistenceFile,
      "request-new-snapshot",
      "2026-09-28",
    );

    expect(result).toMatchObject({
      duplicate: false,
      result: { importId: "new-import" },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDate: "2026-09-28",
        estimationBaseDate: "2026-09-28",
      }),
      "request-new-snapshot",
    );
    expect(repository.updatePositionReferenceDate).not.toHaveBeenCalled();
    expect(getEmergencyReserveAssetKey(assigned)).toBe(
      getEmergencyReserveAssetKey(nextIdentity),
    );
  });

  it("ignores assignments without a B3 position in the latest snapshot", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [
        { product: "New CDB", assetCode: "NEW", institution: "Bank" },
      ],
    });
    repository.listLatestPositions.mockResolvedValue([]);
    objectives.list.mockResolvedValue({
      objectives: [{ id: "trip", name: "Viagem" }],
      assignments: [{ assetKey: "v1:manual-position", objectiveId: "trip" }],
    });

    await expect(
      importService.previewWithIdentityConflicts(persistenceFile, "request-1"),
    ).resolves.toMatchObject({ identityConflicts: [] });
  });

  it("sorts assigned identity conflicts and reports only anchored candidates", async () => {
    const previousA = {
      product: "CDB A",
      assetCode: "CDB-A",
      institution: "Banco A",
      issuer: null,
      indexer: "CDI",
      regimeType: "PÃ“S",
      issuedAt: "2025-01-01",
      maturityAt: null,
    };
    const previousB = {
      product: "CDB B",
      assetCode: null,
      institution: "Banco A",
      issuer: "Emissor B",
      indexer: "CDI",
      regimeType: "PÃ“S",
      issuedAt: "2025-01-01",
      maturityAt: "2027-01-01",
    };
    const incoming = [
      {
        ...previousA,
        institution: "Banco novo",
      },
      {
        ...previousB,
        product: "Produto substituto",
        assetCode: "CDB-B-NOVO",
        issuer: null,
      },
      {
        product: "Sem vínculo",
        assetCode: "OUTRO",
        institution: "Banco C",
      },
    ];
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: incoming,
    });
    repository.listLatestPositions.mockResolvedValue([
      previousB,
      previousA,
      previousA,
      { product: "CDB manual", assetCode: "MANUAL", institution: "Banco" },
    ]);
    objectives.list.mockResolvedValue({
      objectives: [{ id: "trip", name: "Viagem" }],
      assignments: [
        {
          assetKey: getEmergencyReserveAssetKey(previousA),
          objectiveId: "trip",
        },
        {
          assetKey: getEmergencyReserveAssetKey(previousB),
          objectiveId: "trip",
        },
        {
          assetKey: "v1:manual-position",
          objectiveId: "trip",
        },
        {
          assetKey: "v1:removed-objective",
          objectiveId: "deleted-objective",
        },
      ],
    });

    const result = await importService.previewWithIdentityConflicts(
      persistenceFile,
      "request-identities",
    );

    expect(result).toMatchObject({
      identityConflicts: [
        {
          assetKey: getEmergencyReserveAssetKey(previousB),
          possibleIncomingDifferences: [],
        },
        {
          assetKey: getEmergencyReserveAssetKey(previousA),
          possibleIncomingDifferences: [
            {
              changedFields: expect.arrayContaining([
                "instituição: Banco A → Banco novo",
              ]),
            },
          ],
        },
      ],
    });
    const conflicts = (
      result as { identityConflicts: Array<{ assetKey: string }> }
    ).identityConflicts;
    expect(conflicts.map(({ assetKey }) => assetKey)).toEqual(
      conflicts.map(({ assetKey }) => assetKey).sort(),
    );
  });

  it("adds deterministic event fingerprints only while confirming movements", async () => {
    const movement = {
      direction: "CREDITO" as const,
      occurredAt: "2026-09-11",
      movementType: "APLICAÇÃO",
      product: "CDB - BANCO INTER",
      assetCode: null,
      institution: "BANCO INTER",
      quantity: "100",
      unitPrice: "1",
      operationValue: "100",
    };
    parser.mockReturnValue({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [movement],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "import-2" });

    await importService.confirm(persistenceFile, "request-2");

    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documentType: "B3_MOVEMENT_XLSX",
        movements: [
          expect.objectContaining({ eventFingerprint: expect.any(String) }),
        ],
      }),
      "request-2",
    );
  });

  it("records per-position Tesouro Selic facts from the B3 snapshot date", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [
        {
          product: "Tesouro Selic 2029",
          maturityAt: "2029-03-01",
          quantity: "1",
          availableQuantity: "1",
          unavailableQuantity: "0",
          institution: "Corretora Exemplo",
          assetCode: null,
        },
      ],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({
      importId: "import-3",
      snapshotId: "snapshot-3",
    });

    await importService.confirm(persistenceFile, "request-3", "2026-09-28");

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceDate: "2026-09-28",
        liquidityFacts: [
          expect.objectContaining({
            status: "determined",
            asOf: "2026-09-28",
            positionSource: "B3_POSITION_XLSX",
          }),
        ],
      }),
      "request-3",
    );
  });

  it("rejects duplicate files and invalid deletion types", async () => {
    parser.mockReturnValue({
      documentType: "B3_MOVEMENT_XLSX",
      movements: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    await expect(
      importService.confirm(persistenceFile, "request-1"),
    ).rejects.toThrow(ApplicationError);
    await expect(importService.delete(null, "request-1")).rejects.toThrow(
      ApplicationError,
    );
  });
});

describe("reconciliation import decisions", () => {
  const tradeId = "11111111-1111-4111-8111-111111111111";
  const otherTradeId = "33333333-3333-4333-8333-333333333333";
  const movementId = "22222222-2222-4222-8222-222222222222";
  const otherMovementId = "44444444-4444-4444-8444-444444444444";
  const link = (trade: string, movement: string) => ({
    tradeId: trade,
    movementId: movement,
    action: "LINK" as const,
  });

  it.each([
    {
      decisions: [link(tradeId, movementId), link(tradeId, movementId)],
      statusCode: 400,
    },
    {
      decisions: [link(tradeId, movementId), link(tradeId, otherMovementId)],
      statusCode: 409,
    },
    {
      decisions: [link(tradeId, movementId), link(otherTradeId, movementId)],
      statusCode: 409,
    },
  ])(
    "rejects duplicated or one-to-many LINK decisions before persistence (%j)",
    async ({ decisions, statusCode }) => {
      await expect(
        importService.saveReconciliationDecisions(
          { decisions },
          "request-invalid",
        ),
      ).rejects.toMatchObject({ statusCode });
      expect(repository.saveB3ReconciliationDecisions).not.toHaveBeenCalled();
    },
  );

  it("rejects an old pair that disappeared from the latest summary", async () => {
    repository.listTradingItems.mockResolvedValue([
      {
        id: tradeId,
        importId: "import",
        sourceRow: 2,
        identityFingerprint: "trade",
        side: "BUY",
        tradingDate: "2026-10-14",
        assetCode: "ABCD3",
        institution: "Corretora",
        quantity: "1",
        grossValue: "20",
      },
    ]);
    repository.listMovements.mockResolvedValue([
      {
        id: movementId,
        direction: "CREDITO",
        occurredAt: "2026-10-16",
        movementType: "Transferência - Liquidação",
        assetCode: "WXYZ4",
        institution: "Corretora",
        quantity: "1",
        operationValue: "20",
      },
    ]);

    await expect(
      importService.saveReconciliationDecisions(
        { decisions: [link(tradeId, movementId)] },
        "request-stale",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.saveB3ReconciliationDecisions).not.toHaveBeenCalled();
  });

  it("rejects malformed decisions and reconciliation on movement files", async () => {
    await expect(
      importService.confirm(persistenceFile, "request", "2026-10-31", [{}]),
    ).rejects.toMatchObject({ statusCode: 400 });
    parser.mockReturnValue({ documentType: "B3_MOVEMENT_XLSX", movements: [] });
    await expect(
      importService.confirm(persistenceFile, "request", null, [
        {
          manualAssetKey: "manual:00000000-0000-0000-0000-000000000001",
          importedAssetKey: "v1:" + "a".repeat(64),
          action: "link",
          manualUpdatedAt: "2026-10-01T00:00:00.000Z",
        },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("existing snapshot reconciliation", () => {
  it("allows explicit reconciliation replay without requesting date overwrite", async () => {
    parser.mockReturnValue({ documentType: "B3_POSITION_XLSX", positions: [] });
    repository.existsByHash.mockResolvedValue(true);
    repository.create.mockResolvedValue({
      importId: "existing",
      snapshotId: "original",
    });
    const decisions = [
      {
        manualAssetKey: "manual:00000000-0000-0000-0000-000000000001",
        importedAssetKey: "v1:" + "a".repeat(64),
        action: "link",
        manualUpdatedAt: "2026-10-01T00:00:00.000Z",
      },
    ];
    await expect(
      importService.confirm(persistenceFile, "r", "2026-09-30", decisions),
    ).resolves.toMatchObject({ duplicate: true, referenceDateUpdated: false });
    expect(repository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reconcileExistingImport: true,
        reconciliationDecisions: decisions,
      }),
      "r",
    );
    expect(repository.updatePositionReferenceDate).not.toHaveBeenCalled();
  });
});

describe("individual import deletion", () => {
  const validId = "00000000-0000-4000-8000-000000000001";

  it("deletes an individual B3 position", async () => {
    repository.deleteLatestPosition.mockResolvedValue(1);

    await expect(
      importService.delete("B3_POSITION_XLSX", "request-position", validId),
    ).resolves.toEqual({
      message: "Posição removida do fechamento atual.",
    });

    expect(repository.deleteLatestPosition).toHaveBeenCalledWith(
      validId,
      "request-position",
    );
    expect(repository.deleteUnreconciledMovement).not.toHaveBeenCalled();
  });

  it("deletes an individual B3 movement", async () => {
    repository.deleteUnreconciledMovement.mockResolvedValue(1);

    await expect(
      importService.delete("B3_MOVEMENT_XLSX", "request-movement", validId),
    ).resolves.toEqual({ message: "Movimentação excluída." });

    expect(repository.deleteUnreconciledMovement).toHaveBeenCalledWith(
      validId,
      "request-movement",
    );
    expect(repository.deleteLatestPosition).not.toHaveBeenCalled();
  });

  it("rejects invalid record identifiers and keeps bulk deletion delegated", async () => {
    await expect(
      importService.delete("B3_POSITION_XLSX", "request", "invalid-id"),
    ).rejects.toMatchObject({ statusCode: 400 });

    repository.deleteByDocumentType.mockResolvedValue(2);
    await expect(
      importService.delete("B3_MOVEMENT_XLSX", "request-bulk"),
    ).resolves.toBe(2);
    expect(repository.deleteByDocumentType).toHaveBeenCalledWith(
      "B3_MOVEMENT_XLSX",
      "request-bulk",
    );
  });
});
