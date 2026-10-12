import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/objectives/projection",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return portfolioObjectivesController.simulateProjection(
        await request.json(),
        requestId,
      );
    } catch (error) {
      const invalidJson = error instanceof SyntaxError;
      const expected = error instanceof ApplicationError || invalidJson;
      logger[expected ? "warn" : "error"](
        "portfolio_objective_projection_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: invalidJson
            ? "O corpo da simulação é inválido."
            : error instanceof ApplicationError
              ? error.message
              : "Não foi possível calcular a projeção do objetivo.",
        },
        {
          status: invalidJson
            ? 400
            : error instanceof ApplicationError
              ? error.statusCode
              : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
