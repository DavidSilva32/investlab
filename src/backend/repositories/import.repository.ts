import { randomUUID } from "node:crypto";
import { inArray, desc, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  imports,
  movementItems,
  positionItems,
  positionSnapshots,
  treasuryPositionLiquidityFacts,
  treasuryLiquidityRules,
} from "@/infrastructure/database/schema";
import type { TreasurySelicLiquidityFact } from "@/backend/types/treasury-selic-liquidity";
import type { ParsedB3Import } from "@/backend/services/b3-xlsx-parser";
import type { PersistedB3Movement } from "@/backend/services/b3-movement-fingerprint";

export type B3DocumentType = ParsedB3Import["documentType"];
type ImportCreateInput =
  | ({
      fileName: string;
      fileHash: string;
      referenceDate: string;
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

  async create(input: ImportCreateInput, requestId?: string) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
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
        .orderBy(desc(positionSnapshots.createdAt))
        .limit(1);
      if (!snapshot) return [];
      const referenceDate = snapshot.referenceDate;
      const positions = await getDatabaseClient()
        .select()
        .from(positionItems)
        .where(eq(positionItems.snapshotId, snapshot.id))
        .orderBy(positionItems.product);
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
          referenceDate,
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
