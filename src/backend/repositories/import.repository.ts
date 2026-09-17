import { inArray, desc, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  imports,
  movementItems,
  positionItems,
  positionSnapshots,
} from "@/infrastructure/database/schema";
import type { ParsedB3Import } from "@/backend/services/b3-xlsx-parser";
import type { PersistedB3Movement } from "@/backend/services/b3-movement-fingerprint";

export type B3DocumentType = ParsedB3Import["documentType"];
type ImportCreateInput =
  | ({ fileName: string; fileHash: string } & Extract<
      ParsedB3Import,
      { documentType: "B3_POSITION_XLSX" }
    >)
  | {
      fileName: string;
      fileHash: string;
      documentType: "B3_MOVEMENT_XLSX";
      movements: PersistedB3Movement[];
    };
const baseDateFromPositionFileName = (fileName?: string | null) => {
  const match = fileName?.match(
    /^posicao-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}-\d{2}\.xlsx$/i,
  );
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
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
            estimationBaseDate:
              input.documentType === "B3_POSITION_XLSX"
                ? input.estimationBaseDate
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
            estimationBaseDate: input.estimationBaseDate,
          })
          .returning();
        await transaction.insert(positionItems).values(
          input.positions.map((position) => ({
            snapshotId: snapshot.id,
            ...position,
          })),
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
      const [importRecord] =
        snapshot.estimationBaseDate === null
          ? await getDatabaseClient()
              .select({ fileName: imports.fileName })
              .from(imports)
              .where(eq(imports.id, snapshot.importId))
              .limit(1)
          : [];
      const estimationBaseDate =
        snapshot.estimationBaseDate ??
        (importRecord
          ? baseDateFromPositionFileName(importRecord.fileName)
          : snapshot.estimationBaseDate);
      const positions = await getDatabaseClient()
        .select()
        .from(positionItems)
        .where(eq(positionItems.snapshotId, snapshot.id))
        .orderBy(positionItems.product);
      return positions.map((position) => ({
        ...position,
        estimationBaseDate,
      }));
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
