import { createHash } from "node:crypto";
import { mcpMutationReplaysRepository } from "@/backend/repositories/mcp-mutation-replays.repository";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { financialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";
import {
  portfolioObjectivesRepository,
  type PortfolioObjectiveRecord,
} from "@/backend/repositories/portfolio-objectives.repository";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { calculateEssentialMonthlyBaseline } from "@/lib/emergency-reserve";
import { centsToNumber, decimalToCents } from "@/lib/portfolio-money";

const maximumAmount = 1_000_000_000_000;
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.enum(["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"]),
  targetAmount: z
    .number()
    .finite()
    .positive()
    .max(maximumAmount)
    .nullable()
    .optional(),
  monthlyPlannedAmount: z
    .number()
    .finite()
    .min(0)
    .max(maximumAmount)
    .nullable()
    .optional(),
});
const updateSchema = createSchema
  .extend({
    purpose: z
      .enum(["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"])
      .nullable()
      .optional(),
  })
  .extend({ objectiveId: z.string().uuid() });
const deleteSchema = z.object({ objectiveId: z.string().uuid() });
export class PortfolioObjectivesService {
  async getOverview(_requestId?: string) {
    const [stored, reserveSettings, recurrences, balanceReferences] =
      await Promise.all([
        portfolioObjectivesRepository.list(),
        emergencyReserveRepository.getSettings(),
        financialRecurrencesRepository.listRecurrences(),
        portfolioObjectivesRepository.listLatestBalanceReferences(),
      ]);
    const essentialBaseline = calculateEssentialMonthlyBaseline(recurrences);
    const reserveExpenseCents = reserveSettings?.monthlyExpenses
      ? decimalToCents(reserveSettings.monthlyExpenses)
      : essentialBaseline.monthlyExpensesCents === "0"
        ? null
        : BigInt(essentialBaseline.monthlyExpensesCents);
    const reserveTargetCents =
      reserveExpenseCents === null
        ? null
        : reserveExpenseCents * BigInt(reserveSettings?.targetMonths ?? 6);

    const objectives = stored.objectives.map((objective) => {
      const observed = balanceReferences.find(
        (reference) => reference.objectiveId === objective.id,
      );
      const targetAmountCents =
        objective.kind === "RESERVE"
          ? reserveTargetCents
          : objective.targetAmount === null
            ? null
            : decimalToCents(objective.targetAmount);
      const currentValueCents = observed?.amountCents ?? null;
      const currentValue = observed
        ? centsToNumber(BigInt(observed.amountCents))
        : null;
      const targetAmount =
        targetAmountCents === null ? null : centsToNumber(targetAmountCents);
      const remainingAmountCents =
        targetAmountCents === null || currentValueCents === null
          ? null
          : (() => {
              const difference = targetAmountCents - BigInt(currentValueCents);
              return (difference > 0n ? difference : 0n).toString();
            })();

      return {
        id: objective.id,
        updatedAt: objective.updatedAt.toISOString(),
        kind: objective.kind,
        purpose: objective.purpose ?? null,
        name: objective.name,
        targetAmount,
        monthlyPlannedAmount:
          objective.monthlyPlannedAmount === null
            ? null
            : centsToNumber(
                decimalToCents(objective.monthlyPlannedAmount) ?? 0n,
              ),
        currentValue,
        remainingAmount:
          remainingAmountCents === null
            ? null
            : centsToNumber(BigInt(remainingAmountCents)),
        progressPercent:
          targetAmount === null || targetAmount <= 0 || currentValue === null
            ? null
            : Math.min((currentValue / targetAmount) * 100, 100),
        balanceTracking: observed
          ? {
              observedAmountCents: observed.amountCents,
              observedOn: observed.observedDate,
            }
          : null,
      };
    });

    return { objectives };
  }

  async create(body: unknown, options?: { idempotencyKey?: string }) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um nome válido e revise a meta em reais, se preenchida.",
        400,
      );
    }
    const { name, purpose, targetAmount, monthlyPlannedAmount } = parsed.data;
    const normalizedInput = {
      name,
      purpose,
      targetAmount: targetAmount == null ? null : targetAmount.toFixed(2),
      monthlyPlannedAmount:
        monthlyPlannedAmount == null ? null : monthlyPlannedAmount.toFixed(2),
    };
    const idempotencyKey = options?.idempotencyKey;
    if (!idempotencyKey) {
      return portfolioObjectivesRepository.create(normalizedInput);
    }
    if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
      throw new ApplicationError("Informe uma chave de repetição válida.", 400);
    }
    const mcpIdempotency = {
      key: idempotencyKey,
      payloadHash: createHash("sha256")
        .update(JSON.stringify(normalizedInput))
        .digest("hex"),
    };
    return portfolioObjectivesRepository.create({
      ...normalizedInput,
      mcpIdempotency,
    });
  }

  async update(
    objectiveId: string,
    body: unknown,
    options?: { expectedUpdatedAt?: string; idempotencyKey?: string },
  ): Promise<PortfolioObjectiveRecord> {
    const parsed = updateSchema.safeParse({
      ...(body as object),
      objectiveId,
    });
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise o nome e os valores preenchidos.",
        400,
      );
    }
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      options?.expectedUpdatedAt,
    );
    const idempotencyKey = options?.idempotencyKey;
    const idempotency = idempotencyKey
      ? {
          operation: "update_objective" as const,
          key: idempotencyKey,
          payloadHash: createHash("sha256")
            .update(
              JSON.stringify({
                objectiveId,
                input: parsed.data,
                expectedUpdatedAt: options.expectedUpdatedAt,
              }),
            )
            .digest("hex"),
        }
      : undefined;
    if (idempotency) {
      if (!expectedUpdatedAt) {
        throw new ApplicationError(
          "Informe a versão atual do objetivo junto com a chave de repetição.",
          400,
        );
      }
      const replay = await mcpMutationReplaysRepository.find(idempotency);
      if (replay) return this.hydrateObjectiveReplay(replay);
    }
    const objective =
      await portfolioObjectivesRepository.getObjective(objectiveId);
    if (!objective) throw new ApplicationError("Objetivo não encontrado.", 404);
    if (
      expectedUpdatedAt &&
      objective.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      if (idempotency) {
        const replay = await mcpMutationReplaysRepository.find(idempotency);
        if (replay) return this.hydrateObjectiveReplay(replay);
      }
      throw new ApplicationError(
        "O objetivo mudou desde a última consulta. Atualize a lista e tente novamente.",
        409,
      );
    }
    if (objective.id === reserveObjectiveId) {
      throw new ApplicationError(
        "A configuração da reserva deve ser alterada em Configurar reserva.",
        400,
      );
    }
    const updateInput = {
      name: parsed.data.name,
      purpose:
        parsed.data.purpose ??
        (objective.purpose === "PERSONAL_GOAL" ||
        objective.purpose === "LONG_TERM_INVESTMENT"
          ? objective.purpose
          : null),
      targetAmount:
        parsed.data.targetAmount == null
          ? null
          : parsed.data.targetAmount.toFixed(2),
      monthlyPlannedAmount:
        parsed.data.monthlyPlannedAmount == null
          ? null
          : parsed.data.monthlyPlannedAmount.toFixed(2),
    };
    const updated = idempotency
      ? await portfolioObjectivesRepository.updateWithMcpReplay(
          objectiveId,
          updateInput,
          expectedUpdatedAt!,
          idempotency,
        )
      : expectedUpdatedAt
        ? await portfolioObjectivesRepository.update(
            objectiveId,
            updateInput,
            expectedUpdatedAt,
          )
        : await portfolioObjectivesRepository.update(objectiveId, updateInput);
    if (!updated) {
      if (
        expectedUpdatedAt &&
        (await portfolioObjectivesRepository.getObjective(objectiveId))
      ) {
        throw new ApplicationError(
          "O objetivo mudou durante a atualização. Atualize a lista e tente novamente.",
          409,
        );
      }
      throw new ApplicationError("Objetivo não encontrado.", 404);
    } else {
      const replayResult =
        "mcpReplayResult" in updated
          ? this.hydrateObjectiveReplay(
              (updated as { mcpReplayResult: unknown }).mcpReplayResult,
            )
          : undefined;
      const mappedUpdate =
        "mcpUpdated" in updated
          ? (updated as { mcpUpdated: PortfolioObjectiveRecord }).mcpUpdated
          : undefined;
      return (replayResult ??
        mappedUpdate ??
        updated) as PortfolioObjectiveRecord;
    }
  }

  private hydrateObjectiveReplay(value: unknown): PortfolioObjectiveRecord {
    const result = value as Record<string, unknown> & {
      createdAt: string | Date;
      updatedAt: string | Date;
    };
    return {
      ...result,
      createdAt: new Date(result.createdAt),
      updatedAt: new Date(result.updatedAt),
    } as PortfolioObjectiveRecord;
  }

  async delete(
    objectiveId: string,
    body: unknown,
    options: {
      expectedUpdatedAt?: string;
      mcpMutation: {
        key: string;
        payloadHash: string;
        replayResult: unknown;
      };
    },
  ): Promise<PortfolioObjectiveRecord | { mcpReplay: unknown }>;
  async delete(
    objectiveId: string,
    body: unknown,
    options?: { expectedUpdatedAt?: string },
  ): Promise<PortfolioObjectiveRecord>;
  async delete(
    objectiveId: string,
    body: unknown,
    options?: {
      expectedUpdatedAt?: string;
      mcpMutation?: {
        key: string;
        payloadHash: string;
        replayResult: unknown;
      };
    },
  ) {
    const parsed = deleteSchema.safeParse({ ...(body as object), objectiveId });
    if (!parsed.success) throw new ApplicationError("Objetivo inválido.", 400);
    const objective =
      await portfolioObjectivesRepository.getObjective(objectiveId);
    if (!objective) throw new ApplicationError("Objetivo não encontrado.", 404);
    const expectedUpdatedAt = this.parseExpectedUpdatedAt(
      options?.expectedUpdatedAt,
    );
    if (
      expectedUpdatedAt &&
      objective.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      throw new ApplicationError(
        "O objetivo mudou desde a última consulta. Atualize a lista antes de excluir.",
        409,
      );
    }
    if (objective.id === reserveObjectiveId) {
      throw new ApplicationError("A Reserva não pode ser excluída.", 400);
    }
    const deleted =
      options?.mcpMutation && expectedUpdatedAt
        ? await portfolioObjectivesRepository.deleteWithMcpReplay(
            objectiveId,
            expectedUpdatedAt,
            {
              operation: "delete_objective",
              key: options.mcpMutation.key,
              payloadHash: options.mcpMutation.payloadHash,
            },
            options.mcpMutation.replayResult,
          )
        : expectedUpdatedAt
          ? await portfolioObjectivesRepository.delete(
              objectiveId,
              expectedUpdatedAt,
            )
          : await portfolioObjectivesRepository.delete(objectiveId);
    if (!deleted) {
      if (
        expectedUpdatedAt &&
        (await portfolioObjectivesRepository.getObjective(objectiveId))
      ) {
        throw new ApplicationError(
          "O objetivo mudou durante a exclusão. Atualize a lista antes de tentar novamente.",
          409,
        );
      }
      throw new ApplicationError("Objetivo não encontrado.", 404);
    } else {
      const replayResult =
        "mcpReplayResult" in deleted
          ? {
              mcpReplay: (deleted as { mcpReplayResult: unknown })
                .mcpReplayResult,
            }
          : undefined;
      const mappedDeletion =
        "mcpDeleted" in deleted
          ? (deleted as { mcpDeleted: PortfolioObjectiveRecord }).mcpDeleted
          : undefined;
      return replayResult ?? mappedDeletion ?? deleted;
    }
  }

  private parseExpectedUpdatedAt(value?: string) {
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      throw new ApplicationError("A versão do objetivo é inválida.", 400);
    }
    return parsed;
  }
}

export const portfolioObjectivesService = new PortfolioObjectivesService();
