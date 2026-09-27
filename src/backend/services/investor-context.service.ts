import { ApplicationError } from "@/backend/errors/application-error";
import { investorContextRepository } from "@/backend/repositories/investor-context.repository";
import { logger } from "@/infrastructure/logging/logger";
import { z } from "zod";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe mês e ano válidos.");

const contextSchema = z
  .object({
    objective: z.string().trim().max(160).nullable(),
    targetMonth: monthSchema.nullable(),
  })
  .strict();

export class InvestorContextService {
  get(requestId?: string) {
    return investorContextRepository.get(requestId);
  }

  async save(input: unknown, requestId?: string) {
    const parsed = contextSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError(
        "Revise o objetivo e o mês em que pretende usar o dinheiro.",
        400,
      );

    const objective = parsed.data.objective?.trim() || null;
    const targetMonth = parsed.data.targetMonth || null;

    logger.info("investor_context_saving", {
      requestId,
      hasObjective: objective !== null,
      hasTargetMonth: targetMonth !== null,
    });
    return investorContextRepository.save(
      { objective, targetMonth },
      requestId,
    );
  }
}

export const investorContextService = new InvestorContextService();
