import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioChatQueryController } from "@/backend/controllers/portfolio-chat-query.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/chat/query",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioChatQueryController.post(request, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"]("portfolio_chat_query_failed", {
        requestId,
        error,
      });
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível consultar os dados da carteira.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
