import { ApplicationError } from "@/backend/errors/application-error";
import { financialCardSettlementRepository } from "@/backend/repositories/financial-card-settlement.repository";
import { financialCardSettlementResolutionSchema } from "@/backend/schemas/financial-card-settlement.schema";

export class FinancialCardSettlementService {
  async listReview() {
    return financialCardSettlementRepository.listReview();
  }

  async resolve(rawInput: unknown) {
    const parsed = financialCardSettlementResolutionSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise a decisão e as compras selecionadas.",
        400,
      );
    }
    return financialCardSettlementRepository.resolve(parsed.data);
  }
}

export const financialCardSettlementService =
  new FinancialCardSettlementService();
