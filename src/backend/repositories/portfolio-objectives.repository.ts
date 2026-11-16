import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  mcpMutationReplaysRepository,
  type McpMutationKey,
} from "@/backend/repositories/mcp-mutation-replays.repository";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  portfolioObjectiveBalanceReferences,
  portfolioObjectiveReferenceBatches,
  portfolioObjectives,
} from "@/infrastructure/database/schema";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

export type PortfolioObjectiveRecord = typeof portfolioObjectives.$inferSelect;

export type McpBalanceIdempotency = {
  operation: string;
  key: string;
  payloadHash: string;
  replayResult: Record<string, unknown>;
};

export class PortfolioObjectivesRepository {
  async list() {
    const userId = requireDataOwnerId();
    const objectives = await getDatabaseClient()
      .select()
      .from(portfolioObjectives)
      .where(eq(portfolioObjectives.userId, userId))
      .orderBy(portfolioObjectives.createdAt);
    return { objectives };
  }

  async create(input: {
    name: string;
    purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT";
    targetAmount: string | null;
    monthlyPlannedAmount: string | null;
    mcpIdempotency?: { key: string; payloadHash: string };
  }): Promise<PortfolioObjectiveRecord> {
    const userId = requireDataOwnerId();
    const createObjective = async (transaction: DatabaseTransaction) => {
      const [objective] = await transaction
        .insert(portfolioObjectives)
        .values({
          name: input.name,
          purpose: input.purpose,
          targetAmount: input.targetAmount,
          monthlyPlannedAmount: input.monthlyPlannedAmount,
          userId,
          kind: "CUSTOM",
        })
        .returning();
      return objective;
    };
    if (!input.mcpIdempotency) {
      const [objective] = await getDatabaseClient()
        .insert(portfolioObjectives)
        .values({
          name: input.name,
          purpose: input.purpose,
          targetAmount: input.targetAmount,
          monthlyPlannedAmount: input.monthlyPlannedAmount,
          userId,
          kind: "CUSTOM",
        })
        .returning();
      return objective;
    }

    const idempotency = {
      operation: "create_objective" as const,
      ...input.mcpIdempotency,
    };
    return getDatabaseClient().transaction(async (transaction) => {
      const reservation = await mcpMutationReplaysRepository.reserve(
        transaction,
        idempotency,
      );
      if (reservation.replayed) {
        const replay = reservation.result as {
          createdAt: string | Date;
          updatedAt: string | Date;
          [key: string]: unknown;
        };
        return {
          ...replay,
          createdAt: new Date(replay.createdAt),
          updatedAt: new Date(replay.updatedAt),
        } as PortfolioObjectiveRecord;
      }
      const objective = await createObjective(transaction);
      await mcpMutationReplaysRepository.complete(
        transaction,
        idempotency,
        objective,
      );
      return objective;
    });
  }

  async update(
    objectiveId: string,
    input: {
      name: string;
      purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
      targetAmount: string | null;
      monthlyPlannedAmount: string | null;
    },
    expectedUpdatedAt?: Date,
  ) {
    const userId = requireDataOwnerId();
    const [objective] = await getDatabaseClient()
      .update(portfolioObjectives)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(portfolioObjectives.id, objectiveId),
          eq(portfolioObjectives.userId, userId),
          ...(expectedUpdatedAt
            ? [eq(portfolioObjectives.updatedAt, expectedUpdatedAt)]
            : []),
        ),
      )
      .returning();
    return objective ?? null;
  }

  async updateWithMcpReplay(
    objectiveId: string,
    input: {
      name: string;
      purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
      targetAmount: string | null;
      monthlyPlannedAmount: string | null;
    },
    expectedUpdatedAt: Date,
    idempotency: McpMutationKey,
  ) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      const reservation = await mcpMutationReplaysRepository.reserve(
        transaction,
        idempotency,
      );
      if (reservation.replayed) {
        return { mcpReplayResult: reservation.result };
      }
      const [previous] = await transaction
        .select()
        .from(portfolioObjectives)
        .where(
          and(
            eq(portfolioObjectives.id, objectiveId),
            eq(portfolioObjectives.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!previous) {
        throw new ApplicationError("Objetivo não encontrado.", 404);
      }
      if (previous.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ApplicationError(
          "O objetivo mudou desde a última consulta. Atualize a lista antes de salvar.",
          409,
        );
      }
      const updatedAt = new Date(
        Math.max(Date.now(), previous.updatedAt.getTime() + 1),
      );
      const [objective] = await transaction
        .update(portfolioObjectives)
        .set({ ...input, updatedAt })
        .where(
          and(
            eq(portfolioObjectives.id, objectiveId),
            eq(portfolioObjectives.userId, userId),
          ),
        )
        .returning();
      if (!objective)
        throw new ApplicationError("Objetivo não encontrado.", 404);
      await mcpMutationReplaysRepository.complete(
        transaction,
        idempotency,
        objective,
      );
      return { mcpUpdated: objective };
    });
  }

  async delete(objectiveId: string, expectedUpdatedAt?: Date) {
    const userId = requireDataOwnerId();
    const [objective] = await getDatabaseClient()
      .delete(portfolioObjectives)
      .where(
        and(
          eq(portfolioObjectives.id, objectiveId),
          eq(portfolioObjectives.userId, userId),
          ...(expectedUpdatedAt
            ? [eq(portfolioObjectives.updatedAt, expectedUpdatedAt)]
            : []),
        ),
      )
      .returning();
    return objective ?? null;
  }

  async deleteWithMcpReplay(
    objectiveId: string,
    expectedUpdatedAt: Date,
    idempotency: McpMutationKey,
    replayResult: unknown,
  ) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      const reservation = await mcpMutationReplaysRepository.reserve(
        transaction,
        idempotency,
      );
      if (reservation.replayed) {
        return { mcpReplayResult: reservation.result };
      }
      if (objectiveId === reserveObjectiveId) {
        throw new ApplicationError("A Reserva não pode ser excluída.", 400);
      }
      const [previous] = await transaction
        .select()
        .from(portfolioObjectives)
        .where(
          and(
            eq(portfolioObjectives.id, objectiveId),
            eq(portfolioObjectives.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!previous)
        throw new ApplicationError("Objetivo não encontrado.", 404);
      if (previous.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ApplicationError(
          "O objetivo mudou desde a última consulta. Atualize a lista antes de excluir.",
          409,
        );
      }
      const [deleted] = await transaction
        .delete(portfolioObjectives)
        .where(
          and(
            eq(portfolioObjectives.id, objectiveId),
            eq(portfolioObjectives.userId, userId),
          ),
        )
        .returning();
      if (!deleted) throw new ApplicationError("Objetivo não encontrado.", 404);
      await mcpMutationReplaysRepository.complete(
        transaction,
        idempotency,
        replayResult,
      );
      return { mcpDeleted: deleted };
    });
  }

  async getObjective(objectiveId: string) {
    const userId = requireDataOwnerId();
    const [objective] = await getDatabaseClient()
      .select()
      .from(portfolioObjectives)
      .where(
        and(
          eq(portfolioObjectives.id, objectiveId),
          eq(portfolioObjectives.userId, userId),
        ),
      )
      .limit(1);
    return objective ?? null;
  }

  async listLatestBalanceReferences() {
    const userId = requireDataOwnerId();
    const rows = await getDatabaseClient()
      .select({
        objectiveId: portfolioObjectiveBalanceReferences.objectiveId,
        amountCents: portfolioObjectiveBalanceReferences.amountCents,
        cdiPercentage: portfolioObjectiveBalanceReferences.cdiPercentage,
        observedDate: portfolioObjectiveReferenceBatches.observedOn,
        createdAt: portfolioObjectiveBalanceReferences.createdAt,
      })
      .from(portfolioObjectiveBalanceReferences)
      .innerJoin(
        portfolioObjectiveReferenceBatches,
        eq(
          portfolioObjectiveBalanceReferences.batchId,
          portfolioObjectiveReferenceBatches.id,
        ),
      )
      .innerJoin(
        portfolioObjectives,
        and(
          eq(
            portfolioObjectiveBalanceReferences.objectiveId,
            portfolioObjectives.id,
          ),
          eq(portfolioObjectives.userId, userId),
        ),
      )
      .where(
        and(
          eq(portfolioObjectiveBalanceReferences.userId, userId),
          eq(portfolioObjectiveReferenceBatches.userId, userId),
        ),
      )
      .orderBy(
        desc(portfolioObjectiveReferenceBatches.observedOn),
        desc(portfolioObjectiveBalanceReferences.createdAt),
        desc(portfolioObjectiveBalanceReferences.id),
      );
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows)
      if (!latest.has(row.objectiveId)) latest.set(row.objectiveId, row);
    return [...latest.values()].map(
      ({ objectiveId, amountCents, observedDate }) => ({
        objectiveId,
        amountCents,
        observedDate,
      }),
    );
  }

  async saveObservedBalance(input: {
    objectiveId: string;
    amountCents: string;
    observedOn: string;
    mcpIdempotency?: McpBalanceIdempotency;
  }) {
    const userId = requireDataOwnerId();
    return getDatabaseClient().transaction(async (transaction) => {
      const [objective] = await transaction
        .select({ id: portfolioObjectives.id })
        .from(portfolioObjectives)
        .where(
          and(
            eq(portfolioObjectives.id, input.objectiveId),
            eq(portfolioObjectives.userId, userId),
          ),
        )
        .for("update");
      if (!objective) return null;
      const [batch] = await transaction
        .insert(portfolioObjectiveReferenceBatches)
        .values({ userId, observedOn: input.observedOn })
        .returning({ id: portfolioObjectiveReferenceBatches.id });
      const [reference] = await transaction
        .insert(portfolioObjectiveBalanceReferences)
        .values({
          batchId: batch.id,
          userId,
          objectiveId: input.objectiveId,
          amountCents: input.amountCents,
          cdiPercentage: null,
          ...(input.mcpIdempotency
            ? {
                mcpOperation: input.mcpIdempotency.operation,
                mcpIdempotencyKey: input.mcpIdempotency.key,
                mcpPayloadHash: input.mcpIdempotency.payloadHash,
                mcpReplayResult: input.mcpIdempotency.replayResult,
              }
            : {}),
        })
        .returning();
      return { ...reference, observedDate: input.observedOn };
    });
  }

  async findMcpBalanceReplay(input: {
    operation: string;
    key: string;
    payloadHash: string;
  }): Promise<Record<string, unknown> | null> {
    const userId = requireDataOwnerId();
    const [reference] = await getDatabaseClient()
      .select({
        payloadHash: portfolioObjectiveBalanceReferences.mcpPayloadHash,
        replayResult: portfolioObjectiveBalanceReferences.mcpReplayResult,
      })
      .from(portfolioObjectiveBalanceReferences)
      .where(
        and(
          eq(portfolioObjectiveBalanceReferences.userId, userId),
          eq(portfolioObjectiveBalanceReferences.mcpOperation, input.operation),
          eq(portfolioObjectiveBalanceReferences.mcpIdempotencyKey, input.key),
        ),
      )
      .limit(1);
    if (!reference) return null;
    if (reference.payloadHash !== input.payloadHash) {
      throw new ApplicationError(
        "Esta chave de repetição já foi usada com outros dados.",
        409,
      );
    }
    if (
      reference.replayResult === null ||
      typeof reference.replayResult !== "object" ||
      Array.isArray(reference.replayResult)
    ) {
      throw new ApplicationError(
        "Não foi possível recuperar o resultado desta atualização. Use uma nova chave de repetição.",
        409,
      );
    }
    return reference.replayResult as Record<string, unknown>;
  }
}

export const portfolioObjectivesRepository =
  new PortfolioObjectivesRepository();
