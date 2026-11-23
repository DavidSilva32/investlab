import { ApplicationError } from "@/backend/errors/application-error";
import { financialEntryRelationsRepository } from "@/backend/repositories/financial-entry-relations.repository";
import { financialEntryRelationSchema } from "@/backend/schemas/financial-entry-relation.schema";

export class FinancialEntryRelationsService {
  async create(rawInput: unknown) {
    const parsed = financialEntryRelationSchema.safeParse(rawInput);
    if (!parsed.success)
      throw new ApplicationError("Revise a relação entre os lançamentos.", 400);
    return financialEntryRelationsRepository.create(parsed.data);
  }
}

export const financialEntryRelationsService =
  new FinancialEntryRelationsService();
