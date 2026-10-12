import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioOperationService } from "@/backend/services/portfolio-operation.service";

export class PortfolioOperationController {
  async list(requestId: string) {
    return Response.json(await portfolioOperationService.list(requestId));
  }

  async create(request: Request, requestId: string) {
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey)
      throw new ApplicationError(
        "A chave de tentativa da operação é obrigatória.",
        400,
      );
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("Revise os dados da operação manual.", 400);
    }
    return Response.json(
      await portfolioOperationService.create(body, idempotencyKey, requestId),
      { status: 201 },
    );
  }

  async reconcile(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("Revise os dados da conciliação.", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ApplicationError("Revise os dados da conciliação.", 400);
    const { operationId, ...decision } = body as Record<string, unknown>;
    if (typeof operationId !== "string")
      throw new ApplicationError("Identificador de operação inválido.", 400);
    return Response.json(
      await portfolioOperationService.reconcile(
        operationId,
        decision,
        requestId,
      ),
      { status: 201 },
    );
  }
}

export const portfolioOperationController = new PortfolioOperationController();
