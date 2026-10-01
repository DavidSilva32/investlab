import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parser = vi.hoisted(() => vi.fn());
const repository = vi.hoisted(() => ({
  existsByHash: vi.fn(),
  updatePositionReferenceDate: vi.fn(),
  listLatestPositions: vi.fn(),
  create: vi.fn(),
  deleteByDocumentType: vi.fn(),
}));
const objectives = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/backend/services/b3-xlsx-parser", () => ({ parseB3Xlsx: parser }));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: objectives,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { importService } from "@/backend/services/import.service";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";

beforeEach(() => {
  vi.clearAllMocks();
  repository.listLatestPositions.mockResolvedValue([]);
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
  it("backfills one confirmed B3 date into both snapshot dates for an exact duplicate", async () => {
    vi.clearAllMocks();
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.updatePositionReferenceDate.mockResolvedValue({
      importId: "import-existing",
      snapshotId: "snapshot-existing",
    });

    const result = await importService.confirm(
      persistenceFile,
      "request-legacy",
      "2026-09-18",
    );

    expect(result).toMatchObject({
      duplicate: true,
      referenceDateUpdated: true,
      result: { importId: "import-existing" },
    });
    expect(repository.updatePositionReferenceDate).toHaveBeenCalledWith(
      expect.any(String),
      "2026-09-18",
      "request-legacy",
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("backfills duplicate metadata without checking identities from a newer snapshot", async () => {
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.updatePositionReferenceDate.mockResolvedValue({
      importId: "import-old",
      snapshotId: "snapshot-old",
    });
    repository.listLatestPositions.mockResolvedValue([
      { product: "CDB atual", assetCode: "CDB-ATUAL", institution: "Banco" },
    ]);
    objectives.list.mockResolvedValue({
      objectives: [{ id: "trip", name: "Viagem" }],
      assignments: [
        {
          assetKey: getEmergencyReserveAssetKey({
            product: "CDB atual",
            assetCode: "CDB-ATUAL",
            institution: "Banco",
            issuer: null,
            indexer: null,
            regimeType: null,
            issuedAt: null,
            maturityAt: null,
          }),
          objectiveId: "trip",
        },
      ],
    });

    await expect(
      importService.confirm(persistenceFile, "request-old-file", "2026-09-28"),
    ).resolves.toMatchObject({ referenceDateUpdated: true });
    expect(repository.listLatestPositions).not.toHaveBeenCalled();
    expect(objectives.list).not.toHaveBeenCalled();
  });

  it("keeps duplicate protection when no matching position snapshot can be updated", async () => {
    vi.clearAllMocks();
    parser.mockReturnValue({
      documentType: "B3_POSITION_XLSX",
      positions: [],
    });
    repository.existsByHash.mockResolvedValue(true);
    repository.updatePositionReferenceDate.mockResolvedValue(null);

    await expect(
      importService.confirm(persistenceFile, "request-legacy", "2026-09-18"),
    ).rejects.toThrow(ApplicationError);
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
    expect(repository.existsByHash).toHaveBeenCalledTimes(1);
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
