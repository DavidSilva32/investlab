import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { personalInvestmentStrategyController } from "@/backend/controllers/personal-investment-strategy.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/strategy/contribution",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError(
          "Informe os dados do aporte em formato válido.",
          400,
        );
      }
      return await personalInvestmentStrategyController.simulateContribution(
        body,
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "personal_investment_strategy_contribution_simulation_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível simular a distribuição do aporte.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
