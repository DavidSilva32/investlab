import { randomUUID } from "node:crypto";
import { and, asc, inArray, desc, eq, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  imports,
  movementItems,
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
import type { PersistedB3Movement } from "@/backend/services/b3-movement-fingerprint";
import type { MonthlyPortfolioSnapshot } from "@/backend/services/monthly-portfolio-review";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
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
    } & Extract<ParsedB3Import, { documentType: "B3_POSITION_XLSX" }>)
  | {
      fileName: string;
      fileHash: string;
      documentType: "B3_MOVEMENT_XLSX";
      movements: PersistedB3Movement[];
    };
export class ImportRepository {
  private async appendReconciliationDecisions(
    transaction: Parameters<
      Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
    >[0],
    input: Extract<ImportCreateInput, { documentType: "B3_POSITION_XLSX" }>,
    importId: string,
    requestId?: string,
  ) {
    if (input.reconciliationDecisions?.length) {
      const events = await transaction
        .select({ recordedAt: positionReconciliationEvents.recordedAt })
        .from(positionReconciliationEvents);
      const recordedAt = new Date(
        events.reduce(
          (latest, event) => Math.max(latest, event.recordedAt.getTime()),
          Date.now(),
        ) + 1,
      );
      await transaction.insert(positionReconciliationEvents).values(
        input.reconciliationDecisions.map((decision) => ({
          manualAssetKey: decision.manualAssetKey,
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
    try {
      return Boolean(
        (
          await getDatabaseClient()
            .select({ id: imports.id })
            .from(imports)
            .where(eq(imports.fileHash, fileHash))
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

  async updatePositionReferenceDate(
    fileHash: string,
    referenceDate: string,
    requestId?: string,
  ) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const [importRecord] = await transaction
          .select({ id: imports.id })
          .from(imports)
          .where(
            and(
              eq(imports.fileHash, fileHash),
              eq(imports.documentType, "B3_POSITION_XLSX"),
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
          .where(eq(positionSnapshots.importId, importRecord.id))
          .returning({ id: positionSnapshots.id });
        if (!snapshot) return null;
        await transaction
          .update(imports)
          .set({ referenceDate, estimationBaseDate: referenceDate })
          .where(eq(imports.id, importRecord.id));
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
  ) {
    await transaction.execute(
      sql`LOCK TABLE ${positionSnapshots}, ${positionItems}, ${portfolioObjectives}, ${portfolioObjectivePositions} IN SHARE ROW EXCLUSIVE MODE`,
    );
    const [latestSnapshot] = await transaction
      .select({ id: positionSnapshots.id })
      .from(positionSnapshots)
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
      .where(eq(positionItems.snapshotId, latestSnapshot.id));
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
        inArray(portfolioObjectivePositions.assetKey, [
          ...positionByAssetKey.keys(),
        ]),
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
      .where(inArray(portfolioObjectives.id, affectedObjectiveIds));
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

  async create(input: ImportCreateInput, requestId?: string) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        if (input.documentType === "B3_POSITION_XLSX") {
          await transaction.execute(
            sql`LOCK TABLE ${manualPortfolioPositions}, ${positionReconciliationEvents}, ${portfolioAssetClassifications} IN SHARE ROW EXCLUSIVE MODE`,
          );
          await this.lockAndValidateAssignedPositionIdentities(
            transaction,
            input.positions,
          );
          const manual = await transaction
            .select()
            .from(manualPortfolioPositions);
          const existingEvents = await transaction
            .select()
            .from(positionReconciliationEvents);
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
                inArray(portfolioObjectivePositions.assetKey, [
                  ...linkedManual,
                  ...linkedImported,
                ]),
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
                inArray(portfolioAssetClassifications.assetKey, [
                  ...linkedManual,
                  ...linkedImported,
                ]),
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
          const [existingImport] = await transaction
            .select({ id: imports.id, referenceDate: imports.referenceDate })
            .from(imports)
            .where(
              and(
                eq(imports.fileHash, input.fileHash),
                eq(imports.documentType, "B3_POSITION_XLSX"),
              ),
            )
            .limit(1);
          if (
            !existingImport ||
            existingImport.referenceDate !== input.referenceDate
          ) {
            throw new ApplicationError(
              "A data deve ser a mesma do arquivo já importado. O histórico existente não será alterado.",
              409,
            );
          }
          const [existingSnapshot] = await transaction
            .select({
              id: positionSnapshots.id,
              referenceDate: positionSnapshots.referenceDate,
            })
            .from(positionSnapshots)
            .where(eq(positionSnapshots.importId, existingImport.id))
            .limit(1);
          if (
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
            requestId,
          );
          return {
            importId: existingImport.id,
            snapshotId: existingSnapshot.id,
          };
        }
        const [importRecord] = await transaction
          .insert(imports)
          .values({
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
          await transaction
            .insert(movementItems)
            .values(
              input.movements.map((movement) => ({
                importId: importRecord.id,
                ...movement,
              })),
            )
            .onConflictDoNothing({ target: movementItems.eventFingerprint });
          return { importId: importRecord.id };
        }
        const [snapshot] = await transaction
          .insert(positionSnapshots)
          .values({
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
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const records = await transaction
          .select({ id: imports.id })
          .from(imports)
          .where(eq(imports.documentType, documentType));
        const importIds = records.map((record) => record.id);
        if (!importIds.length) return 0;
        if (documentType === "B3_MOVEMENT_XLSX") {
          const sourceMovements = await transaction
            .select({ id: movementItems.id })
            .from(movementItems)
            .where(inArray(movementItems.importId, importIds));
          if (sourceMovements.length) {
            const reconciliations = await transaction
              .select({ id: portfolioOperationReconciliationEvents.id })
              .from(portfolioOperationReconciliationEvents)
              .where(
                inArray(
                  portfolioOperationReconciliationEvents.movementId,
                  sourceMovements.map(({ id }) => id),
                ),
              )
              .limit(1);
            if (reconciliations.length)
              throw new ApplicationError(
                "Este arquivo contém movimentações ligadas ou já conciliadas. Preserve o arquivo importado para manter a origem e o histórico da conciliação.",
                409,
              );
          }
          await transaction
            .delete(movementItems)
            .where(inArray(movementItems.importId, importIds));
        } else {
          await transaction.execute(
            sql`LOCK TABLE ${positionSnapshots}, ${positionItems} IN SHARE ROW EXCLUSIVE MODE`,
          );
          const snapshots = await transaction
            .select({ id: positionSnapshots.id })
            .from(positionSnapshots)
            .where(inArray(positionSnapshots.importId, importIds));
          const snapshotIds = snapshots.map((snapshot) => snapshot.id);
          if (snapshotIds.length) {
            await transaction
              .delete(positionItems)
              .where(inArray(positionItems.snapshotId, snapshotIds));
            await transaction
              .delete(positionSnapshots)
              .where(inArray(positionSnapshots.id, snapshotIds));
          }
        }
        await transaction.delete(imports).where(inArray(imports.id, importIds));
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
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${positionSnapshots}, ${positionItems} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [latestSnapshot] = await transaction
          .select({ id: positionSnapshots.id })
          .from(positionSnapshots)
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
          .where(eq(positionItems.id, positionId));
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
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        await transaction.execute(
          sql`LOCK TABLE ${portfolioOperationReconciliationEvents} IN SHARE ROW EXCLUSIVE MODE`,
        );
        const [movement] = await transaction
          .select({ id: movementItems.id })
          .from(movementItems)
          .where(eq(movementItems.id, movementId))
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
            eq(portfolioOperationReconciliationEvents.movementId, movementId),
          )
          .limit(1);
        if (reconciliation)
          throw new ApplicationError(
            "Esta movimentação já foi conciliada e não pode ser excluída.",
            409,
          );
        await transaction
          .delete(movementItems)
          .where(eq(movementItems.id, movementId));
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
    try {
      const [snapshot] = await getDatabaseClient()
        .select()
        .from(positionSnapshots)
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
        .where(eq(positionItems.snapshotId, snapshot.id))
        .orderBy(asc(positionItems.product), asc(positionItems.id));
      const positionIds = positions.flatMap((position) =>
        typeof position.id === "string" ? [position.id] : [],
      );
      const facts = positionIds.length
        ? await getDatabaseClient()
            .select()
            .from(treasuryPositionLiquidityFacts)
            .where(
              inArray(
                treasuryPositionLiquidityFacts.positionItemId,
                positionIds,
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
        return {
          ...position,
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
          inArray(
            positionItems.snapshotId,
            snapshots.map((snapshot) => snapshot.id),
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
    try {
      return await getDatabaseClient()
        .select()
        .from(movementItems)
        .orderBy(desc(movementItems.occurredAt), desc(movementItems.createdAt));
    } catch (error) {
      logger.error("database_movements_query_failed", { requestId, error });
      throw error;
    }
  }
}
export const importRepository = new ImportRepository();
