import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { personalInvestmentStrategyController } from "@/backend/controllers/personal-investment-strategy.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(
  error: unknown,
  requestId: string,
  operation: "read" | "save",
) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("personal_investment_strategy_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível carregar a estratégia."
          : "Não foi possível salvar a estratégia.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await personalInvestmentStrategyController.get(requestId);
  } catch (error) {
    return failure(error, requestId, "read");
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError(
        "O corpo da requisição não é um JSON válido.",
        400,
      );
    }
    return await personalInvestmentStrategyController.save(body, requestId);
  } catch (error) {
    return failure(error, requestId, "save");
  }
}
