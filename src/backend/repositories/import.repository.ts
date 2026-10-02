import { randomUUID } from "node:crypto";
import { and, asc, inArray, desc, eq, sql } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  imports,
  movementItems,
  positionItems,
  positionSnapshots,
  portfolioObjectivePositions,
  portfolioObjectives,
  treasuryPositionLiquidityFacts,
  treasuryLiquidityRules,
} from "@/infrastructure/database/schema";
import type { TreasurySelicLiquidityFact } from "@/backend/types/treasury-selic-liquidity";
import type { ParsedB3Import } from "@/backend/services/b3-xlsx-parser";
import type { PersistedB3Movement } from "@/backend/services/b3-movement-fingerprint";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
const sourceSnapshotIdKey = Symbol.for("investlab.positionSnapshotId");

export type B3DocumentType = ParsedB3Import["documentType"];
type ImportCreateInput =
  | ({
      fileName: string;
      fileHash: string;
      referenceDate: string;
      estimationBaseDate?: string | null;
      liquidityFacts?: Array<TreasurySelicLiquidityFact | null>;
    } & Extract<ParsedB3Import, { documentType: "B3_POSITION_XLSX" }>)
  | {
      fileName: string;
      fileHash: string;
      documentType: "B3_MOVEMENT_XLSX";
      movements: PersistedB3Movement[];
    };
export class ImportRepository {
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
      .orderBy(desc(positionSnapshots.createdAt), desc(positionSnapshots.id))
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
          await this.lockAndValidateAssignedPositionIdentities(
            transaction,
            input.positions,
          );
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

  async listLatestPositions(requestId?: string) {
    try {
      const [snapshot] = await getDatabaseClient()
        .select()
        .from(positionSnapshots)
        .orderBy(desc(positionSnapshots.createdAt), desc(positionSnapshots.id))
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
