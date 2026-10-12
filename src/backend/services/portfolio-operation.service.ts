import { ApplicationError } from "@/backend/errors/application-error";
import { z } from "zod";
import { portfolioOperationRepository } from "@/backend/repositories/portfolio-operation.repository";
import {
  applyPortfolioOperationLinks,
  getPortfolioOperationCandidates,
  getUnlinkedPortfolioMovements,
} from "@/backend/services/portfolio-operation-reconciliation";
import {
  portfolioOperationSchema,
  reconciliationRequestSchema,
} from "@/backend/schemas/portfolio-operation.schema";

export class PortfolioOperationService {
  async list(requestId?: string) {
    const { operations, movements, events } =
      await portfolioOperationRepository.list(requestId);
    const links = applyPortfolioOperationLinks(events);
    return {
      operations,
      movements,
      pendingMovements: getUnlinkedPortfolioMovements(movements, links),
      candidates: getPortfolioOperationCandidates(operations, movements, links),
      links,
    };
  }

  async create(input: unknown, idempotencyKey: string, requestId?: string) {
    if (!z.string().uuid().safeParse(idempotencyKey).success)
      throw new ApplicationError(
        "A chave de tentativa da operação é inválida.",
        400,
      );
    const parsed = portfolioOperationSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise os dados da operação manual.", 400);
    return portfolioOperationRepository.create(
      { ...parsed.data, assetCode: parsed.data.assetCode || null },
      idempotencyKey,
      requestId,
    );
  }

  async reconcile(operationId: string, input: unknown, requestId: string) {
    if (!z.string().uuid().safeParse(operationId).success)
      throw new ApplicationError("Identificador de operação inválido.", 400);
    const parsed = reconciliationRequestSchema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise os dados da conciliação.", 400);
    if (parsed.data.action === "LINK") {
      const { candidates } = await this.list(requestId);
      const available = candidates.some(
        (candidate) =>
          candidate.operationId === operationId &&
          candidate.movementId === parsed.data.movementId,
      );
      if (!available)
        throw new ApplicationError(
          "A movimentação não é mais um candidato para essa operação. Atualize a lista antes de confirmar.",
          409,
        );
    }
    return portfolioOperationRepository.reconcile(
      operationId,
      parsed.data.movementId,
      parsed.data.action,
      requestId,
    );
  }
}

export const portfolioOperationService = new PortfolioOperationService();
