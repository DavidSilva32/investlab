import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
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

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio/strategy",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await personalInvestmentStrategyController.get(requestId);
    } catch (error) {
      return failure(error, requestId, "read");
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/strategy",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
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
  },
);
