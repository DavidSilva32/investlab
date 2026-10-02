import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioObjectivesController.saveObservedBalance(
      await request.json(),
      requestId,
    );
  } catch (error) {
    const expected = error instanceof ApplicationError;
    logger[expected ? "warn" : "error"]("portfolio_objective_balance_failed", {
      requestId,
      error,
    });
    return Response.json(
      {
        message: expected ? error.message : "Não foi possível salvar o saldo.",
      },
      { status: expected ? error.statusCode : 500 },
    );
  }
}
