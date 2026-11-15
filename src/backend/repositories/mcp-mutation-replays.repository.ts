import { and, eq } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { mcpMutationReplays } from "@/infrastructure/database/schema";

export type McpMutationTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

export type McpMutationOperation =
  | "create_objective"
  | "update_objective"
  | "delete_objective"
  | "create_manual_position"
  | "update_manual_position"
  | "delete_manual_position";

export type McpMutationKey = {
  operation: McpMutationOperation;
  key: string;
  payloadHash: string;
};

export type McpMutationReservation =
  { replayed: false } | { replayed: true; result: unknown };

export class McpMutationReplaysRepository {
  async reserve(
    transaction: McpMutationTransaction,
    input: McpMutationKey,
  ): Promise<McpMutationReservation> {
    const userId = requireDataOwnerId();
    const [created] = await transaction
      .insert(mcpMutationReplays)
      .values({
        userId,
        operation: input.operation,
        idempotencyKey: input.key,
        payloadHash: input.payloadHash,
      })
      .onConflictDoNothing({
        target: [
          mcpMutationReplays.userId,
          mcpMutationReplays.operation,
          mcpMutationReplays.idempotencyKey,
        ],
      })
      .returning({ id: mcpMutationReplays.id });
    if (created) return { replayed: false };

    const [existing] = await transaction
      .select()
      .from(mcpMutationReplays)
      .where(
        and(
          eq(mcpMutationReplays.userId, userId),
          eq(mcpMutationReplays.operation, input.operation),
          eq(mcpMutationReplays.idempotencyKey, input.key),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      throw new ApplicationError(
        "Não foi possível confirmar a repetição desta alteração.",
        409,
      );
    }
    if (existing.payloadHash !== input.payloadHash) {
      throw new ApplicationError(
        "Esta chave de repetição já foi usada com outros dados.",
        409,
      );
    }
    if (existing.result === null) {
      throw new ApplicationError(
        "Esta alteração está sendo processada. Tente novamente com a mesma chave.",
        409,
      );
    }
    return { replayed: true, result: existing.result };
  }

  async complete(
    transaction: McpMutationTransaction,
    input: McpMutationKey,
    result: unknown,
  ) {
    const userId = requireDataOwnerId();
    const [completed] = await transaction
      .update(mcpMutationReplays)
      .set({ result })
      .where(
        and(
          eq(mcpMutationReplays.userId, userId),
          eq(mcpMutationReplays.operation, input.operation),
          eq(mcpMutationReplays.idempotencyKey, input.key),
          eq(mcpMutationReplays.payloadHash, input.payloadHash),
        ),
      )
      .returning({ id: mcpMutationReplays.id });
    if (!completed) {
      throw new ApplicationError(
        "Não foi possível registrar o resultado da alteração.",
        500,
      );
    }
  }

  async find(input: McpMutationKey) {
    const userId = requireDataOwnerId();
    const [existing] = await getDatabaseClient()
      .select()
      .from(mcpMutationReplays)
      .where(
        and(
          eq(mcpMutationReplays.userId, userId),
          eq(mcpMutationReplays.operation, input.operation),
          eq(mcpMutationReplays.idempotencyKey, input.key),
        ),
      )
      .limit(1);
    if (!existing) return null;
    if (existing.payloadHash !== input.payloadHash) {
      throw new ApplicationError(
        "Esta chave de repetição já foi usada com outros dados.",
        409,
      );
    }
    if (existing.result === null) {
      throw new ApplicationError(
        "Esta alteração está sendo processada. Tente novamente com a mesma chave.",
        409,
      );
    }
    return existing.result;
  }
}

export const mcpMutationReplaysRepository = new McpMutationReplaysRepository();
