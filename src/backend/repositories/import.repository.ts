import { desc, eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import {
  imports,
  positionItems,
  positionSnapshots,
} from "@/infrastructure/database/schema";
import type { ParsedB3Position } from "../services/b3-position-xlsx-parser";

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

  async create(
    input: {
      fileName: string;
      fileHash: string;
      positions: ParsedB3Position[];
    },
    requestId?: string,
  ) {
    try {
      return await getDatabaseClient().transaction(async (transaction) => {
        const [importRecord] = await transaction
          .insert(imports)
          .values({ fileName: input.fileName, fileHash: input.fileHash })
          .returning();
        const [snapshot] = await transaction
          .insert(positionSnapshots)
          .values({ importId: importRecord.id })
          .returning();
        await transaction.insert(positionItems).values(
          input.positions.map((position) => ({
            snapshotId: snapshot.id,
            ...position,
          })),
        );
        return snapshot;
      });
    } catch (error) {
      logger.error("database_import_persistence_failed", { requestId, error });
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
      return await getDatabaseClient()
        .select()
        .from(positionItems)
        .where(eq(positionItems.snapshotId, snapshot.id))
        .orderBy(positionItems.product);
    } catch (error) {
      logger.error("database_positions_query_failed", { requestId, error });
      throw error;
    }
  }
}

export const importRepository = new ImportRepository();
