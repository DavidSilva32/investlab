import { randomUUID } from "node:crypto";
import { and, asc, inArray, desc, eq, isNull, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  imports,
  movementItems,
  tradingItems,
  b3ReconciliationEvents,
  portfolioOperationReconciliationEvents,
  positionItems,
  positionSnapshots,
  portfolioObjectivePositions,
  portfolioObjectives,
  treasuryPositionLiquidityFacts,
  treasuryLiquidityRules,
  manualPortfolioPositions,
  positionReconciliationEvents,
  portfolioAssetClassifications,
} from "@/infrastructure/database/schema";
import type { TreasurySelicLiquidityFact } from "@/backend/types/treasury-selic-liquidity";
import type { ParsedB3Import } from "@/backend/services/b3-xlsx-parser";
import type { ParsedB3Trade } from "@/backend/services/b3-trading-xlsx-parser";
import type { PersistedB3Movement } from "@/backend/services/b3-movement-fingerprint";
import type { MonthlyPortfolioSnapshot } from "@/backend/services/monthly-portfolio-review";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { classifyInstrumentKind } from "@/lib/instrument-kind";
import {
  activeReconciliationLinks,
  getReconciliationCandidates,
  unresolvedReconciliationCandidates,
  type ReconciliationDecision,
} from "@/backend/services/position-reconciliation";
const sourceSnapshotIdKey = Symbol.for("investlab.positionSnapshotId");

export type B3DocumentType = ParsedB3Import["documentType"];
type ImportCreateInput =
  | ({
      fileName: string;
      fileHash: string;
      referenceDate: string;
      estimationBaseDate?: string | null;
      liquidityFacts?: Array<TreasurySelicLiquidityFact | null>;
      reconciliationDecisions?: ReconciliationDecision[];
      reconcileExistingImport?: boolean;
      reprocessExistingImport?: boolean;
    } & Extract<ParsedB3Import, { documentType: "B3_POSITION_XLSX" }>)
  | {
      fileName: string;
      fileHash: string;
      documentType: "B3_MOVEMENT_XLSX";
      movements: PersistedB3Movement[];
    }
  | {
      fileName: string;
      fileHash: string;
      documentType: "B3_TRADING_XLSX";
      trades: Array<ParsedB3Trade & { identityFingerprint: string }>;
    };
type B3PositionImportInput = Extract<
  ImportCreateInput,
  { documentType: "B3_POSITION_XLSX" }
>;

function normalizedAnchor(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function normalizedQuantity(value: string) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, integer, fraction = ""] = match;
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  const isZero = /^0+$/.test(normalizedInteger) && normalizedFraction === "";
  return `${sign === "-" && !isZero ? "-" : ""}${normalizedInteger}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
}

const genericInstrumentKinds = new Set(["UNKNOWN", "INVESTMENT_FUND"]);
export class ImportRepository {
  private async appendReconciliationDecisions(
    transaction: Parameters<
      Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
    >[0],
    input: Extract<ImportCreateInput, { documentType: "B3_POSITION_XLSX" }>,
    importId: string,
    userId: string,
    requestId?: string,
  ) {
    if (input.reconciliationDecisions?.length) {
      const events = await transaction
        .select({ recordedAt: positionReconciliationEvents.recordedAt })
        .from(positionReconciliationEvents)
        .where(eq(positionReconciliationEvents.userId, userId));
      const recordedAt = new Date(
        events.reduce(
          (latest, event) => Math.max(latest, event.recordedAt.getTime()),
          Date.now(),
        ) + 1,
      );
      await transaction.insert(positionReconciliationEvents).values(
        input.reconciliationDecisions.map((decision) => ({
          manualAssetKey: decision.manualAssetKey,
          userId,
          importedAssetKey: decision.importedAssetKey,
          status:
            decision.action === "link"
              ? ("LINK" as const)
              : ("SEPARATE" as const),
          effectiveFrom: input.referenceDate,
          recordedAt,
          requestId: requestId ?? "import",
          importId,
        })),
      );
    }
  }
  async existsByHash(fileHash: string, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return Boolean(
        (
          await getDatabaseClient()
            .select({ id: imports.id })
            .from(imports)
            .where(
              and(eq(imports.fileHash, fileHash), eq(imports.userId, userId)),
            )
            .limit(1)
        )[0],
      );
    } catch (error) {
      logger.error("database_import_duplicate_check_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async getPositionImportReferenceDateByHash(fileHash: string) {
    const userId = requireDataOwnerId();
    const matches = await getDatabaseClient()
      .select({
        referenceDate: imports.referenceDate,
        snapshotReferenceDate: positionSnapshots.referenceDate,
        snapshotId: positionSnapshots.id,
      })
      .from(imports)
      .leftJoin(positionSnapshots, eq(positionSnapshots.importId, imports.id))
      .where(
        and(
          eq(imports.fileHash, fileHash),
          eq(imports.documentType, "B3_POSITION_XLSX"),
          eq(imports.userId, userId),
        ),
      )
      .limit(2);
    if (matches.length !== 1 || !matches[0]!.snapshotId)
      return { referenceDate: null, needsSelection: false, conflict: true };
    const { referenceDate, snapshotReferenceDate } = matches[0]!;
    if (referenceDate === null && snapshotReferenceDate === null)
      return { referenceDate: null, needsSelection: true, conflict: false };
    if (referenceDate !== null && referenceDate === snapshotReferenceDate)
      return { referenceDate, needsSelection: false, conflict: false };
    return { referenceDate: null, needsSelection: false, conflict: true };
  }

  async updatePositionReferenceDate(
    fileHash: string,
    referenceDate: string,
    requestId?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const [importRecord] = await transaction
          .select({ id: imports.id })
          .from(imports)
          .where(
            and(
              eq(imports.fileHash, fileHash),
              eq(imports.documentType, "B3_POSITION_XLSX"),
              eq(imports.userId, userId),
            ),
          )
          .limit(1);
        if (!importRecord) return null;
        await transaction.execute(
          sql`LOCK TABLE ${positionSnapshots} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [snapshot] = await transaction
          .update(positionSnapshots)
          .set({ referenceDate, estimationBaseDate: referenceDate })
          .where(
            and(
              eq(positionSnapshots.importId, importRecord.id),
              eq(positionSnapshots.userId, userId),
            ),
          )
          .returning({ id: positionSnapshots.id });
        if (!snapshot) return null;
        await transaction
          .update(imports)
          .set({ referenceDate, estimationBaseDate: referenceDate })
          .where(
            and(eq(imports.id, importRecord.id), eq(imports.userId, userId)),
          );
        return { importId: importRecord.id, snapshotId: snapshot.id };
      });
    } catch (error) {
      logger.error("database_import_reference_date_update_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  private async lockAndValidateAssignedPositionIdentities(
    transaction: Parameters<
      Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
    >[0],
    incomingPositions: Extract<
      ParsedB3Import,
      { documentType: "B3_POSITION_XLSX" }
    >["positions"],
    userId: string,
  ) {
    await transaction.execute(
      sql`LOCK TABLE ${positionSnapshots}, ${positionItems}, ${portfolioObjectives}, ${portfolioObjectivePositions} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const [latestSnapshot] = await transaction
      .select({ id: positionSnapshots.id })
      .from(positionSnapshots)
      .where(eq(positionSnapshots.userId, userId))
      .orderBy(
        sql`${positionSnapshots.referenceDate} DESC NULLS LAST`,
        desc(positionSnapshots.createdAt),
        desc(positionSnapshots.id),
      )
      .limit(1);
    if (!latestSnapshot) return;

    const currentPositions = await transaction
      .select()
      .from(positionItems)
      .where(
        and(
          eq(positionItems.snapshotId, latestSnapshot.id),
          eq(positionItems.userId, userId),
        ),
      );
    const positionByAssetKey = new Map(
      currentPositions.map((position) => [
        getEmergencyReserveAssetKey(position),
        position,
      ]),
    );
    if (positionByAssetKey.size === 0) return;

    const assignments = await transaction
      .select()
      .from(portfolioObjectivePositions)
      .where(
        and(
          eq(portfolioObjectivePositions.userId, userId),
          inArray(portfolioObjectivePositions.assetKey, [
            ...positionByAssetKey.keys(),
          ]),
        ),
      );
    const incomingAssetKeys = new Set(
      incomingPositions.map(getEmergencyReserveAssetKey),
    );
    const conflicts = assignments.filter(
      (assignment) => !incomingAssetKeys.has(assignment.assetKey),
    );
    if (!conflicts.length) return;

    const affectedObjectiveIds = [
      ...new Set(conflicts.map(({ objectiveId }) => objectiveId)),
    ];
    const affectedObjectives = await transaction
      .select({ id: portfolioObjectives.id, name: portfolioObjectives.name })
      .from(portfolioObjectives)
      .where(
        and(
          eq(portfolioObjectives.userId, userId),
          inArray(portfolioObjectives.id, affectedObjectiveIds),
        ),
      );
    const objectiveNameById = new Map(
      affectedObjectives.map((objective) => [objective.id, objective.name]),
    );
    const conflict = conflicts[0]!;
    const position = positionByAssetKey.get(conflict.assetKey)!;
    throw new ApplicationError(
      `A posição ${position.product} atribuída a ${objectiveNameById.get(conflict.objectiveId) ?? "um objetivo"} mudou enquanto a importação era preparada. Atualize a prévia e investigue a identidade antes de confirmar.`,
      409,
    );
  }

  private async enrichExistingB3PositionImport(
    transaction: Parameters<
      Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
    >[0],
    input: B3PositionImportInput,
    userId: string,
  ) {
    const [existingImport, ...ambiguousImports] = await transaction
      .select({
        id: imports.id,
        referenceDate: imports.referenceDate,
        estimationBaseDate: imports.estimationBaseDate,
      })
      .from(imports)
      .where(
        and(
          eq(imports.fileHash, input.fileHash),
          eq(imports.documentType, "B3_POSITION_XLSX"),
          eq(imports.userId, userId),
        ),
      )
      .for("update")
      .limit(2);
    if (ambiguousImports.length > 0)
      throw new ApplicationError(
        "Não foi possível enriquecer o arquivo: há importações idênticas ambíguas.",
        409,
      );
    if (!existingImport)
      throw new ApplicationError(
        "Não foi possível localizar a importação idêntica.",
        409,
      );

    const [snapshot, ...ambiguousSnapshots] = await transaction
      .select({
        id: positionSnapshots.id,
        referenceDate: positionSnapshots.referenceDate,
        estimationBaseDate: positionSnapshots.estimationBaseDate,
      })
      .from(positionSnapshots)
      .where(
        and(
          eq(positionSnapshots.importId, existingImport.id),
          eq(positionSnapshots.userId, userId),
        ),
      )
      .for("update")
      .limit(2);
    if (
      !snapshot ||
      ambiguousSnapshots.length > 0 ||
      (existingImport.referenceDate === null) !==
        (snapshot.referenceDate === null) ||
      (existingImport.referenceDate !== null &&
        (existingImport.referenceDate !== snapshot.referenceDate ||
          existingImport.referenceDate !== input.referenceDate))
    )
      throw new ApplicationError(
        "A data do arquivo e do snapshot divergem ou não podem ser preenchidas com segurança.",
        409,
      );

    const existingPositions = await transaction
      .select()
      .from(positionItems)
      .where(
        and(
          eq(positionItems.snapshotId, snapshot.id),
          eq(positionItems.userId, userId),
        ),
      )
      .for("update");
    const sourceKey = (sourceSheet: string, sourceRow: number) =>
      JSON.stringify([sourceSheet.trim(), sourceRow]);
    const existingBySource = new Map<
      string,
      (typeof existingPositions)[number]
    >();
    const legacyPositions: typeof existingPositions = [];
    for (const position of existingPositions) {
      if (!position.sourceSheet.trim() && position.sourceRow === 0) {
        legacyPositions.push(position);
        continue;
      }
      const key = sourceKey(position.sourceSheet, position.sourceRow);
      if (
        !position.sourceSheet.trim() ||
        position.sourceRow <= 0 ||
        existingBySource.has(key)
      )
        throw new ApplicationError(
          "Não foi possível enriquecer o arquivo: as linhas de origem estão ausentes ou ambíguas.",
          409,
        );
      existingBySource.set(key, position);
    }
    const incomingBySource = new Map<
      string,
      (typeof input.positions)[number]
    >();
    for (const position of input.positions) {
      const key = sourceKey(position.sourceSheet, position.sourceRow);
      if (
        !position.sourceSheet.trim() ||
        position.sourceRow <= 0 ||
        incomingBySource.has(key)
      )
        throw new ApplicationError(
          "Não foi possível enriquecer o arquivo: as linhas da prévia estão ausentes ou ambíguas.",
          409,
        );
      incomingBySource.set(key, position);
    }
    if (existingPositions.length !== input.positions.length)
      throw new ApplicationError(
        "Não foi possível enriquecer o arquivo: a quantidade de linhas diverge do snapshot existente.",
        409,
      );

    const matchesAnchor = (
      current: (typeof existingPositions)[number],
      incoming: (typeof input.positions)[number],
    ) =>
      normalizedAnchor(current.product) ===
        normalizedAnchor(incoming.product) &&
      normalizedQuantity(current.quantity) !== null &&
      normalizedQuantity(current.quantity) ===
        normalizedQuantity(incoming.quantity) &&
      (
        [
          [current.assetCode, incoming.assetCode],
          [current.isin, incoming.isin],
          [current.issuerCnpj, incoming.issuerCnpj],
        ] as const
      ).every(
        ([stored, parsed]) =>
          !stored ||
          !parsed ||
          normalizedAnchor(stored) === normalizedAnchor(parsed),
      );
    const currentByIncoming = new Map<
      string,
      (typeof existingPositions)[number]
    >();
    const assignedIncomingKeys = new Set<string>();
    for (const [key, current] of existingBySource) {
      const incoming = incomingBySource.get(key);
      if (!incoming || !matchesAnchor(current, incoming))
        throw new ApplicationError(
          "Não foi possível enriquecer o arquivo: a identidade ou quantidade de uma linha diverge.",
          409,
        );
      currentByIncoming.set(key, current);
      assignedIncomingKeys.add(key);
    }
    for (const current of legacyPositions) {
      const candidates = [...incomingBySource.entries()].filter(
        ([key, incoming]) =>
          !assignedIncomingKeys.has(key) && matchesAnchor(current, incoming),
      );
      if (candidates.length !== 1)
        throw new ApplicationError(
          "Não foi possível enriquecer o snapshot antigo: a correspondência por produto, quantidade e códigos não é única.",
          409,
        );
      const [incomingKey] = candidates[0]!;
      currentByIncoming.set(incomingKey, current);
      assignedIncomingKeys.add(incomingKey);
    }

    if (existingImport.referenceDate === null) {
      if (
        (existingImport.estimationBaseDate !== null &&
          existingImport.estimationBaseDate !== input.referenceDate) ||
        (snapshot.estimationBaseDate !== null &&
          snapshot.estimationBaseDate !== input.referenceDate)
      )
        throw new ApplicationError(
          "A data-base de estimativa existente diverge da data escolhida para o snapshot legado. Nenhuma data foi alterada.",
          409,
        );
      const importUpdate: Partial<typeof imports.$inferInsert> = {
        referenceDate: input.referenceDate,
      };
      if (existingImport.estimationBaseDate === null)
        importUpdate.estimationBaseDate = input.referenceDate;
      const updatedImport = await transaction
        .update(imports)
        .set(importUpdate)
        .where(
          and(
            eq(imports.id, existingImport.id),
            eq(imports.userId, userId),
            isNull(imports.referenceDate),
          ),
        )
        .returning({ id: imports.id });
      const snapshotUpdate: Partial<typeof positionSnapshots.$inferInsert> = {
        referenceDate: input.referenceDate,
      };
      if (snapshot.estimationBaseDate === null)
        snapshotUpdate.estimationBaseDate = input.referenceDate;
      const updatedSnapshot = await transaction
        .update(positionSnapshots)
        .set(snapshotUpdate)
        .where(
          and(
            eq(positionSnapshots.id, snapshot.id),
            eq(positionSnapshots.userId, userId),
            isNull(positionSnapshots.referenceDate),
          ),
        )
        .returning({ id: positionSnapshots.id });
      if (updatedImport.length !== 1 || updatedSnapshot.length !== 1)
        throw new ApplicationError(
          "O snapshot mudou durante o enriquecimento. Atualize a prévia.",
          409,
        );
    }

    let enrichedPositionCount = 0;
    for (const [key, incoming] of incomingBySource) {
      const current = currentByIncoming.get(key)!;
      const updates: Partial<typeof positionItems.$inferInsert> = {};
      if (current.totalValue === null && incoming.totalValue !== null) {
        updates.unitPrice = incoming.unitPrice;
        updates.totalValue = incoming.totalValue;
        updates.valuationSource = incoming.valuationSource;
      }
      if (
        genericInstrumentKinds.has(current.instrumentKind) &&
        !genericInstrumentKinds.has(incoming.instrumentKind)
      )
        updates.instrumentKind = incoming.instrumentKind;
      if (Object.keys(updates).length === 0) continue;

      const updated = await transaction
        .update(positionItems)
        .set(updates)
        .where(
          and(
            eq(positionItems.id, current.id),
            eq(positionItems.userId, userId),
            eq(positionItems.snapshotId, snapshot.id),
          ),
        )
        .returning({ id: positionItems.id });
      if (updated.length !== 1)
        throw new ApplicationError(
          "O snapshot mudou durante o enriquecimento. Atualize a prévia.",
          409,
        );
      enrichedPositionCount += 1;
    }

    return {
      importId: existingImport.id,
      snapshotId: snapshot.id,
      enrichedPositionCount,
      referenceDateUpdated: existingImport.referenceDate === null,
    };
  }

  async create(input: ImportCreateInput, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        if (input.documentType === "B3_POSITION_XLSX") {
          if (
            input.reprocessExistingImport &&
            !input.reconciliationDecisions?.length &&
            !input.reconcileExistingImport
          ) {
            return this.enrichExistingB3PositionImport(
              transaction,
              input,
              userId,
            );
          }
          await transaction.execute(
            sql`LOCK TABLE ${manualPortfolioPositions}, ${positionReconciliationEvents}, ${portfolioAssetClassifications} IN SHARE ROW EXCLUSIVE MODE`,
          );
          if (!input.reprocessExistingImport)
            await this.lockAndValidateAssignedPositionIdentities(
              transaction,
              input.positions,
              userId,
            );
          const manual = await transaction
            .select()
            .from(manualPortfolioPositions)
            .where(eq(manualPortfolioPositions.userId, userId));
          const existingEvents = await transaction
            .select()
            .from(positionReconciliationEvents)
            .where(eq(positionReconciliationEvents.userId, userId));
          const candidates = unresolvedReconciliationCandidates(
            getReconciliationCandidates(input.positions, manual),
            existingEvents,
          );
          const decisions = input.reconciliationDecisions ?? [];
          const decisionKeys = new Set(
            decisions.map((decision) =>
              JSON.stringify([
                decision.manualAssetKey,
                decision.importedAssetKey,
              ]),
            ),
          );
          if (
            decisionKeys.size !== decisions.length ||
            decisions.length !== candidates.length ||
            candidates.some(
              (candidate) =>
                !decisions.some(
                  (decision) =>
                    decision.manualAssetKey === candidate.manualAssetKey &&
                    decision.importedAssetKey === candidate.importedAssetKey &&
                    decision.manualUpdatedAt === candidate.manualUpdatedAt,
                ),
            )
          ) {
            throw new ApplicationError(
              "As posições mudaram. Atualize a prévia e confirme as correspondências novamente.",
              409,
            );
          }
          const linkedManual = decisions
            .filter((decision) => decision.action === "link")
            .map((decision) => decision.manualAssetKey);
          const linkedImported = decisions
            .filter((decision) => decision.action === "link")
            .map((decision) => decision.importedAssetKey);
          if (
            new Set(linkedManual).size !== linkedManual.length ||
            new Set(linkedImported).size !== linkedImported.length
          ) {
            throw new ApplicationError(
              "Selecione apenas uma correspondência para cada posição.",
              409,
            );
          }
          if (linkedImported.length) {
            const existingLinks = activeReconciliationLinks(existingEvents);
            if (
              decisions.some(
                (decision) =>
                  decision.action === "link" &&
                  existingLinks.some(
                    (link) =>
                      (link.importedAssetKey === decision.importedAssetKey &&
                        link.manualAssetKey !== decision.manualAssetKey) ||
                      (link.manualAssetKey === decision.manualAssetKey &&
                        link.importedAssetKey !== decision.importedAssetKey),
                  ),
              )
            ) {
              throw new ApplicationError(
                "Uma destas posições já possui outra conciliação ativa. Desfaça o vínculo existente antes de escolher esta correspondência.",
                409,
              );
            }
            const assignments = await transaction
              .select()
              .from(portfolioObjectivePositions)
              .where(
                and(
                  eq(portfolioObjectivePositions.userId, userId),
                  inArray(portfolioObjectivePositions.assetKey, [
                    ...linkedManual,
                    ...linkedImported,
                  ]),
                ),
              );
            const objectiveByKey = new Map(
              assignments.map((assignment) => [
                assignment.assetKey,
                assignment.objectiveId,
              ]),
            );
            if (
              decisions.some(
                (decision) =>
                  decision.action === "link" &&
                  objectiveByKey.has(decision.importedAssetKey) &&
                  objectiveByKey.get(decision.manualAssetKey) !==
                    objectiveByKey.get(decision.importedAssetKey),
              )
            ) {
              throw new ApplicationError(
                "Revise os objetivos das posições antes de conciliar.",
                409,
              );
            }
            const classifications = await transaction
              .select()
              .from(portfolioAssetClassifications)
              .where(
                and(
                  eq(portfolioAssetClassifications.userId, userId),
                  inArray(portfolioAssetClassifications.assetKey, [
                    ...linkedManual,
                    ...linkedImported,
                  ]),
                ),
              );
            const classificationByKey = new Map(
              classifications.map((classification) => [
                classification.assetKey,
                classification,
              ]),
            );
            if (
              decisions.some((decision) => {
                if (decision.action !== "link") return false;
                const manualClassification = classificationByKey.get(
                  decision.manualAssetKey,
                );
                const importedClassification = classificationByKey.get(
                  decision.importedAssetKey,
                );
                return (
                  manualClassification &&
                  importedClassification &&
                  (["assetClass", "subClass", "geography"] as const).some(
                    (field) =>
                      manualClassification[field] !==
                      importedClassification[field],
                  )
                );
              })
            ) {
              throw new ApplicationError(
                "Revise a classificação das posições antes de conciliar.",
                409,
              );
            }
          }
        }
        if (
          input.documentType === "B3_POSITION_XLSX" &&
          input.reconcileExistingImport
        ) {
          if (!input.reprocessExistingImport) {
            const [existingImport] = await transaction
              .select({ id: imports.id, referenceDate: imports.referenceDate })
              .from(imports)
              .where(
                and(
                  eq(imports.fileHash, input.fileHash),
                  eq(imports.documentType, "B3_POSITION_XLSX"),
                  eq(imports.userId, userId),
                ),
              )
              .limit(1);
            const [existingSnapshot] = await transaction
              .select({
                id: positionSnapshots.id,
                referenceDate: positionSnapshots.referenceDate,
              })
              .from(positionSnapshots)
              .where(
                and(
                  eq(positionSnapshots.importId, existingImport?.id ?? ""),
                  eq(positionSnapshots.userId, userId),
                ),
              )
              .limit(1);
            if (
              !existingImport ||
              existingImport.referenceDate !== input.referenceDate ||
              !existingSnapshot ||
              existingSnapshot.referenceDate !== input.referenceDate ||
              !input.reconciliationDecisions?.length
            ) {
              throw new ApplicationError(
                "Atualize a prévia para conciliar o arquivo existente.",
                409,
              );
            }
            await this.appendReconciliationDecisions(
              transaction,
              input,
              existingImport.id,
              userId,
              requestId,
            );
            return {
              importId: existingImport.id,
              snapshotId: existingSnapshot.id,
            };
          }
          if (!input.reconciliationDecisions?.length) {
            throw new ApplicationError(
              "Atualize a prévia para conciliar o arquivo existente.",
              409,
            );
          }
          const existing = await this.enrichExistingB3PositionImport(
            transaction,
            input,
            userId,
          );
          await this.appendReconciliationDecisions(
            transaction,
            input,
            existing.importId,
            userId,
            requestId,
          );
          return {
            ...existing,
          };
        }
        const [importRecord] = await transaction
          .insert(imports)
          .values({
            userId,
            fileName: input.fileName,
            fileHash: input.fileHash,
            documentType: input.documentType,
            referenceDate:
              input.documentType === "B3_POSITION_XLSX"
                ? input.referenceDate
                : null,
            estimationBaseDate:
              input.documentType === "B3_POSITION_XLSX"
                ? (input.estimationBaseDate ?? null)
                : null,
          })
          .returning();
        if (input.documentType === "B3_MOVEMENT_XLSX") {
          await transaction.insert(movementItems).values(
            input.movements.map((movement) => ({
              userId,
              importId: importRecord.id,
              ...movement,
            })),
          );
          return { importId: importRecord.id };
        }
        if (input.documentType === "B3_TRADING_XLSX") {
          await transaction.insert(tradingItems).values(
            input.trades.map((trade) => ({
              userId,
              importId: importRecord.id,
              ...trade,
            })),
          );
          return { importId: importRecord.id };
        }
        const [snapshot] = await transaction
          .insert(positionSnapshots)
          .values({
            userId,
            importId: importRecord.id,
            referenceDate: input.referenceDate,
            estimationBaseDate: input.estimationBaseDate ?? null,
          })
          .returning();
        const positionRows = input.positions.map((position, index) => ({
          id: randomUUID(),
          position,
          fact: input.liquidityFacts?.[index] ?? null,
        }));
        const persistedPositions = await transaction
          .insert(positionItems)
          .values(
            positionRows.map(({ id, position }) => ({
              id,
              userId,
              snapshotId: snapshot.id,
              ...position,
            })),
          )
          .returning({ id: positionItems.id });
        const rowById = new Map<string, (typeof positionRows)[number]>(
          positionRows.map((row) => [row.id, row]),
        );
        const facts = persistedPositions.flatMap(({ id }) => {
          const row = rowById.get(id);
          const fact = row?.fact;
          if (!row || !fact) return [];
          return [
            {
              positionItemId: id,
              userId,
              snapshotId: snapshot.id,
              ruleVersion: fact.ruleVersion,
              status: fact.status,
              reasons: fact.reasons,
              asOf: fact.asOf ?? input.referenceDate,
              normalizedTitleType: fact.normalizedTitleType,
              maturityAt: fact.maturityAt,
              positionQuantity: row.position.quantity,
              availableQuantity: row.position.availableQuantity,
              unavailableQuantity: row.position.unavailableQuantity,
              institution: row.position.institution,
              assetCode: row.position.assetCode,
              settlementEstimate: fact.settlementEstimate,
              source: fact.positionSource,
            },
          ];
        });
        if (facts.length)
          await transaction
            .insert(treasuryPositionLiquidityFacts)
            .values(facts);
        await this.appendReconciliationDecisions(
          transaction,
          input,
          importRecord.id,
          userId,
          requestId,
        );
        return { importId: importRecord.id, snapshotId: snapshot.id };
      });
    } catch (error) {
      logger.error("database_import_persistence_failed", { requestId, error });
      throw error;
    }
  }

  async deleteByDocumentType(documentType: B3DocumentType, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const records = await transaction
          .select({ id: imports.id })
          .from(imports)
          .where(
            and(
              eq(imports.documentType, documentType),
              eq(imports.userId, userId),
            ),
          );
        const importIds = records.map((record) => record.id);
        if (!importIds.length) return 0;
        if (documentType === "B3_MOVEMENT_XLSX") {
          const sourceMovements = await transaction
            .select({ id: movementItems.id })
            .from(movementItems)
            .where(
              and(
                eq(movementItems.userId, userId),
                inArray(movementItems.importId, importIds),
              ),
            );
          if (sourceMovements.length) {
            const reconciliations = await transaction
              .select({ id: portfolioOperationReconciliationEvents.id })
              .from(portfolioOperationReconciliationEvents)
              .where(
                and(
                  eq(portfolioOperationReconciliationEvents.userId, userId),
                  inArray(
                    portfolioOperationReconciliationEvents.movementId,
                    sourceMovements.map(({ id }) => id),
                  ),
                ),
              )
              .limit(1);
            if (reconciliations.length)
              throw new ApplicationError(
                "Este arquivo contém movimentações ligadas ou já conciliadas. Preserve o arquivo importado para manter a origem e o histórico da conciliação.",
                409,
              );
            const b3Reconciliations = await transaction
              .select({ id: b3ReconciliationEvents.id })
              .from(b3ReconciliationEvents)
              .where(
                and(
                  eq(b3ReconciliationEvents.userId, userId),
                  inArray(
                    b3ReconciliationEvents.movementItemId,
                    sourceMovements.map(({ id }) => id),
                  ),
                ),
              )
              .limit(1);
            if (b3Reconciliations.length)
              throw new ApplicationError(
                "Este arquivo contém movimentações vinculadas à negociação. Remova o vínculo antes de excluir a origem.",
                409,
              );
          }
          await transaction
            .delete(movementItems)
            .where(
              and(
                eq(movementItems.userId, userId),
                inArray(movementItems.importId, importIds),
              ),
            );
        } else if (documentType === "B3_TRADING_XLSX") {
          const sourceTrades = await transaction
            .select({ id: tradingItems.id })
            .from(tradingItems)
            .where(
              and(
                eq(tradingItems.userId, userId),
                inArray(tradingItems.importId, importIds),
              ),
            );
          if (sourceTrades.length) {
            const reconciliations = await transaction
              .select({ id: b3ReconciliationEvents.id })
              .from(b3ReconciliationEvents)
              .where(
                and(
                  eq(b3ReconciliationEvents.userId, userId),
                  inArray(
                    b3ReconciliationEvents.tradingItemId,
                    sourceTrades.map(({ id }) => id),
                  ),
                ),
              )
              .limit(1);
            if (reconciliations.length)
              throw new ApplicationError(
                "Este arquivo contém negociações vinculadas a movimentações. Remova o vínculo antes de excluir a origem.",
                409,
              );
          }
          await transaction
            .delete(tradingItems)
            .where(
              and(
                eq(tradingItems.userId, userId),
                inArray(tradingItems.importId, importIds),
              ),
            );
        } else {
          await transaction.execute(
            sql`LOCK TABLE ${positionSnapshots}, ${positionItems} IN SHARE ROW EXCLUSIVE MODE`,
          );
          const snapshots = await transaction
            .select({ id: positionSnapshots.id })
            .from(positionSnapshots)
            .where(
              and(
                eq(positionSnapshots.userId, userId),
                inArray(positionSnapshots.importId, importIds),
              ),
            );
          const snapshotIds = snapshots.map((snapshot) => snapshot.id);
          if (snapshotIds.length) {
            await transaction
              .delete(positionItems)
              .where(
                and(
                  eq(positionItems.userId, userId),
                  inArray(positionItems.snapshotId, snapshotIds),
                ),
              );
            await transaction
              .delete(positionSnapshots)
              .where(
                and(
                  eq(positionSnapshots.userId, userId),
                  inArray(positionSnapshots.id, snapshotIds),
                ),
              );
          }
        }
        await transaction
          .delete(imports)
          .where(
            and(eq(imports.userId, userId), inArray(imports.id, importIds)),
          );
        return importIds.length;
      });
    } catch (error) {
      logger.error("database_import_deletion_failed", {
        requestId,
        error,
        documentType,
      });
      throw error;
    }
  }

  async deleteLatestPosition(positionId: string, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${positionSnapshots}, ${positionItems} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [latestSnapshot] = await transaction
          .select({ id: positionSnapshots.id })
          .from(positionSnapshots)
          .where(eq(positionSnapshots.userId, userId))
          .orderBy(
            sql`${positionSnapshots.referenceDate} DESC NULLS LAST`,
            desc(positionSnapshots.createdAt),
            desc(positionSnapshots.id),
          )
          .limit(1);
        if (!latestSnapshot)
          throw new ApplicationError(
            "O fechamento atual não foi encontrado.",
            404,
          );
        const [position] = await transaction
          .select({ id: positionItems.id, source: positionItems.source })
          .from(positionItems)
          .where(
            and(
              eq(positionItems.id, positionId),
              eq(positionItems.snapshotId, latestSnapshot.id),
              eq(positionItems.userId, userId),
            ),
          )
          .limit(1);
        if (!position || position.source !== "B3")
          throw new ApplicationError(
            "Esta posição não pertence ao fechamento atual da B3.",
            404,
          );
        await transaction
          .delete(positionItems)
          .where(
            and(
              eq(positionItems.id, positionId),
              eq(positionItems.userId, userId),
            ),
          );
        return 1;
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      logger.error("database_position_item_deletion_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async deleteUnreconciledMovement(movementId: string, requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${portfolioOperationReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [movement] = await transaction
          .select({ id: movementItems.id })
          .from(movementItems)
          .where(
            and(
              eq(movementItems.id, movementId),
              eq(movementItems.userId, userId),
            ),
          )
          .limit(1);
        if (!movement)
          throw new ApplicationError(
            "Esta movimentação não foi encontrada.",
            404,
          );
        const [reconciliation] = await transaction
          .select({ id: portfolioOperationReconciliationEvents.id })
          .from(portfolioOperationReconciliationEvents)
          .where(
            and(
              eq(portfolioOperationReconciliationEvents.movementId, movementId),
              eq(portfolioOperationReconciliationEvents.userId, userId),
            ),
          )
          .limit(1);
        if (reconciliation)
          throw new ApplicationError(
            "Esta movimentação já foi conciliada e não pode ser excluída.",
            409,
          );
        await transaction
          .delete(movementItems)
          .where(
            and(
              eq(movementItems.id, movementId),
              eq(movementItems.userId, userId),
            ),
          );
        return 1;
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      logger.error("database_movement_item_deletion_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async listLatestPositions(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const [snapshot] = await getDatabaseClient()
        .select()
        .from(positionSnapshots)
        .where(eq(positionSnapshots.userId, userId))
        .orderBy(
          sql`${positionSnapshots.referenceDate} DESC NULLS LAST`,
          desc(positionSnapshots.createdAt),
          desc(positionSnapshots.id),
        )
        .limit(1);
      if (!snapshot) return [];
      const referenceDate = snapshot.referenceDate;
      const estimationBaseDate = snapshot.estimationBaseDate;
      const positions = await getDatabaseClient()
        .select()
        .from(positionItems)
        .where(
          and(
            eq(positionItems.snapshotId, snapshot.id),
            eq(positionItems.userId, userId),
          ),
        )
        .orderBy(asc(positionItems.product), asc(positionItems.id));
      const positionIds = positions.flatMap((position) =>
        typeof position.id === "string" ? [position.id] : [],
      );
      const facts = positionIds.length
        ? await getDatabaseClient()
            .select()
            .from(treasuryPositionLiquidityFacts)
            .where(
              and(
                eq(treasuryPositionLiquidityFacts.userId, userId),
                inArray(
                  treasuryPositionLiquidityFacts.positionItemId,
                  positionIds,
                ),
              ),
            )
        : [];
      const factByPositionId = new Map(
        facts.map((fact) => [fact.positionItemId, fact]),
      );
      const ruleVersions = [...new Set(facts.map((fact) => fact.ruleVersion))];
      const rules = ruleVersions.length
        ? await getDatabaseClient()
            .select()
            .from(treasuryLiquidityRules)
            .where(inArray(treasuryLiquidityRules.version, ruleVersions))
        : [];
      const ruleByVersion = new Map(rules.map((rule) => [rule.version, rule]));
      return positions.map((position) => {
        const fact = factByPositionId.get(position.id);
        const classifiedInstrumentKind = classifyInstrumentKind({
          product: position.product,
          sourceType: position.sourceType,
          sourceSheet: position.sourceSheet,
        });
        return {
          ...position,
          instrumentKind:
            classifiedInstrumentKind === "UNKNOWN"
              ? position.instrumentKind
              : classifiedInstrumentKind,
          [sourceSnapshotIdKey]: snapshot.id,
          referenceDate,
          estimationBaseDate,
          ...(fact
            ? {
                liquidityProfile: {
                  ...fact,
                  rule: ruleByVersion.get(fact.ruleVersion) ?? null,
                },
              }
            : {}),
        };
      });
    } catch (error) {
      logger.error("database_positions_query_failed", { requestId, error });
      throw error;
    }
  }

  async listPositionSnapshots(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      const snapshots = await getDatabaseClient()
        .select({
          id: positionSnapshots.id,
          referenceDate: positionSnapshots.referenceDate,
          importReferenceDate: imports.referenceDate,
          createdAt: positionSnapshots.createdAt,
          importedAt: imports.createdAt,
          source: imports.origin,
        })
        .from(positionSnapshots)
        .innerJoin(imports, eq(imports.id, positionSnapshots.importId))
        .where(
          and(
            eq(imports.documentType, "B3_POSITION_XLSX"),
            eq(imports.status, "CONFIRMED"),
            eq(imports.userId, userId),
            eq(positionSnapshots.userId, userId),
          ),
        )
        .orderBy(
          asc(positionSnapshots.referenceDate),
          asc(positionSnapshots.createdAt),
          asc(positionSnapshots.id),
        );
      if (snapshots.length === 0) return [];

      const positions = await getDatabaseClient()
        .select({
          snapshotId: positionItems.snapshotId,
          product: positionItems.product,
          institution: positionItems.institution,
          issuer: positionItems.issuer,
          assetCode: positionItems.assetCode,
          indexer: positionItems.indexer,
          regimeType: positionItems.regimeType,
          issuedAt: positionItems.issuedAt,
          maturityAt: positionItems.maturityAt,
          totalValue: positionItems.totalValue,
          valuationSource: positionItems.valuationSource,
        })
        .from(positionItems)
        .where(
          and(
            eq(positionItems.userId, userId),
            inArray(
              positionItems.snapshotId,
              snapshots.map((snapshot) => snapshot.id),
            ),
          ),
        );
      const positionsBySnapshot = new Map<
        string,
        MonthlyPortfolioSnapshot["positions"]
      >();
      for (const position of positions) {
        const existing = positionsBySnapshot.get(position.snapshotId) ?? [];
        existing.push({
          reconciliationAssetKey: getEmergencyReserveAssetKey(position),
          identity: position.assetCode?.trim()
            ? JSON.stringify([
                position.assetCode.trim().toUpperCase(),
                position.product.trim().toLocaleUpperCase("pt-BR"),
                position.institution?.trim().toLocaleUpperCase("pt-BR") ?? null,
                position.issuer?.trim().toLocaleUpperCase("pt-BR") ?? null,
              ])
            : position.product.trim() &&
                position.institution?.trim() &&
                position.issuer?.trim() &&
                position.maturityAt
              ? JSON.stringify([
                  position.product.trim().toLocaleUpperCase("pt-BR"),
                  position.institution.trim().toLocaleUpperCase("pt-BR"),
                  position.issuer.trim().toLocaleUpperCase("pt-BR"),
                  position.indexer?.trim().toLocaleUpperCase("pt-BR") ?? null,
                  position.regimeType?.trim().toLocaleUpperCase("pt-BR") ??
                    null,
                  position.issuedAt,
                  position.maturityAt,
                ])
              : null,
          totalValue: position.totalValue,
          valuationSource: position.valuationSource,
        });
        positionsBySnapshot.set(position.snapshotId, existing);
      }

      return snapshots.map((snapshot): MonthlyPortfolioSnapshot => ({
        id: snapshot.id,
        referenceDate: snapshot.referenceDate ?? snapshot.importReferenceDate,
        createdAt: snapshot.createdAt,
        importedAt: snapshot.importedAt,
        source: snapshot.source,
        positions: positionsBySnapshot.get(snapshot.id) ?? [],
      }));
    } catch (error) {
      logger.error("database_position_snapshot_history_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async listMovements(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient()
        .select()
        .from(movementItems)
        .where(eq(movementItems.userId, userId))
        .orderBy(desc(movementItems.occurredAt), desc(movementItems.createdAt));
    } catch (error) {
      logger.error("database_movements_query_failed", { requestId, error });
      throw error;
    }
  }

  async listTradingItems(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient()
        .select()
        .from(tradingItems)
        .where(eq(tradingItems.userId, userId))
        .orderBy(asc(tradingItems.tradingDate), asc(tradingItems.createdAt));
    } catch (error) {
      logger.error("database_trading_items_query_failed", { requestId, error });
      throw error;
    }
  }

  async listB3ReconciliationEvents(requestId?: string) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient()
        .select()
        .from(b3ReconciliationEvents)
        .where(eq(b3ReconciliationEvents.userId, userId))
        .orderBy(asc(b3ReconciliationEvents.eventOrder));
    } catch (error) {
      logger.error("database_b3_reconciliation_events_query_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }

  async saveB3ReconciliationDecisions(
    decisions: Array<{
      tradeId: string;
      movementId: string;
      action: "LINK" | "KEEP_SEPARATE";
    }>,
    requestId?: string,
  ) {
    const userId = requireDataOwnerId();
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${b3ReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [trades, movements, events] = await Promise.all([
          transaction
            .select({ id: tradingItems.id })
            .from(tradingItems)
            .where(eq(tradingItems.userId, userId)),
          transaction
            .select({ id: movementItems.id })
            .from(movementItems)
            .where(eq(movementItems.userId, userId)),
          transaction
            .select()
            .from(b3ReconciliationEvents)
            .where(eq(b3ReconciliationEvents.userId, userId))
            .orderBy(asc(b3ReconciliationEvents.eventOrder)),
        ]);
        const tradeIds = new Set(trades.map(({ id }) => id));
        const movementIds = new Set(movements.map(({ id }) => id));
        if (
          decisions.some(
            (decision) =>
              !tradeIds.has(decision.tradeId) ||
              !movementIds.has(decision.movementId),
          )
        )
          throw new ApplicationError(
            "Atualize a reconciliação: uma das linhas não está mais disponível.",
            409,
          );
        const latestByPair = new Map<string, (typeof events)[number]>();
        for (const event of events) {
          latestByPair.set(
            JSON.stringify([event.tradingItemId, event.movementItemId]),
            event,
          );
        }
        const activeLinks = [...latestByPair.values()].filter(
          ({ status }) => status === "LINK",
        );
        if (
          decisions.some(
            (decision) =>
              decision.action === "LINK" &&
              activeLinks.some(
                (link) =>
                  (link.tradingItemId === decision.tradeId &&
                    link.movementItemId !== decision.movementId) ||
                  (link.movementItemId === decision.movementId &&
                    link.tradingItemId !== decision.tradeId),
              ),
          )
        )
          throw new ApplicationError(
            "Uma linha já está vinculada a outro registro. Revise a conciliação antes de confirmar.",
            409,
          );
        if (decisions.length) {
          await transaction.insert(b3ReconciliationEvents).values(
            decisions.map((decision) => ({
              userId,
              tradingItemId: decision.tradeId,
              movementItemId: decision.movementId,
              status: decision.action,
            })),
          );
        }
        return decisions.length;
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      logger.error("database_b3_reconciliation_save_failed", {
        requestId,
        error,
      });
      throw error;
    }
  }
}
export const importRepository = new ImportRepository();
