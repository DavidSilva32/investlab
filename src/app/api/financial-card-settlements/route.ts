import { ApplicationError } from "@/backend/errors/application-error";
import { financialCardSettlementController } from "@/backend/controllers/financial-card-settlement.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/financial-card-settlements",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialCardSettlementController.getReview(requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "financial_card_settlement_review_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível carregar pagamentos para conferência.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/financial-card-settlements",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError("Revise a decisão informada.", 400);
      }
      return await financialCardSettlementController.resolve(body, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "financial_card_settlement_resolution_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível salvar a conferência.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
