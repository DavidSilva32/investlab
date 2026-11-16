import { createHash } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  portfolioObjectivesRepository,
  type McpBalanceIdempotency,
} from "@/backend/repositories/portfolio-objectives.repository";
import {
  isFutureValuationDate,
  isValidValuationDate,
} from "@/lib/valuation-date";
import { decimalToCents } from "@/lib/portfolio-money";

const maximumAmount = 1_000_000_000_000;
const saveSchema = z.object({
  objectiveId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/)
    .refine((amount) => {
      const cents = decimalToCents(amount);
      return (
        cents !== null && cents >= 0n && cents <= BigInt(maximumAmount) * 100n
      );
    }),
  observedOn: z
    .string()
    .refine(isValidValuationDate, "Informe uma data válida.")
    .refine(
      (date) => !isFutureValuationDate(date),
      "A data não pode ser futura.",
    ),
});

export class ObjectiveBalanceService {
  constructor(private readonly repository = portfolioObjectivesRepository) {}

  async save(
    input: unknown,
    _requestId?: string,
    options?: { idempotencyKey?: string },
  ) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise os dados do saldo informado.", 400);
    const amountCents = decimalToCents(parsed.data.amount)!.toString();
    const mcpIdempotency = options?.idempotencyKey
      ? this.buildMcpIdempotency(parsed.data, options.idempotencyKey)
      : undefined;
    if (mcpIdempotency) {
      const replay = await this.repository.findMcpBalanceReplay({
        operation: mcpIdempotency.operation,
        key: mcpIdempotency.key,
        payloadHash: mcpIdempotency.payloadHash,
      });
      if (replay) return replay;
    }
    const replayResult = {
      objectiveId: parsed.data.objectiveId,
      amountCents,
      observedDate: parsed.data.observedOn,
    };
    const mcpWrite = mcpIdempotency
      ? { ...mcpIdempotency, replayResult }
      : undefined;
    let saved;
    try {
      saved = await this.repository.saveObservedBalance({
        objectiveId: parsed.data.objectiveId,
        amountCents,
        observedOn: parsed.data.observedOn,
        mcpIdempotency: mcpWrite,
      });
    } catch (error) {
      const persistenceError = error as { code?: string; statusCode?: number };
      if (
        mcpIdempotency &&
        (persistenceError.code === "23505" ||
          persistenceError.statusCode === 409)
      ) {
        const replay = await this.repository.findMcpBalanceReplay({
          operation: mcpIdempotency.operation,
          key: mcpIdempotency.key,
          payloadHash: mcpIdempotency.payloadHash,
        });
        if (replay) return replay;
      }
      throw error;
    }
    if (!saved) throw new ApplicationError("Objetivo não encontrado.", 404);
    return mcpIdempotency
      ? ((await this.repository.findMcpBalanceReplay({
          operation: mcpIdempotency.operation,
          key: mcpIdempotency.key,
          payloadHash: mcpIdempotency.payloadHash,
        })) ?? replayResult)
      : saved;
  }

  private buildMcpIdempotency(
    input: { objectiveId: string; amount: string; observedOn: string },
    key: string,
  ): McpBalanceIdempotency {
    if (key.length < 8 || key.length > 128) {
      throw new ApplicationError("Informe uma chave de repetição válida.", 400);
    }
    const normalized = {
      objectiveId: input.objectiveId,
      amountCents: decimalToCents(input.amount)!.toString(),
      observedOn: input.observedOn,
    };
    const payloadHash = createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");
    return {
      operation: "save_observed_balance",
      key,
      payloadHash,
      replayResult: {},
    };
  }
}

export const objectiveBalanceService = new ObjectiveBalanceService();
