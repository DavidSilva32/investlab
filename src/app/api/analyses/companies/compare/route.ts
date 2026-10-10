import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { stockComparisonController } from "@/backend/controllers/stock-comparison.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/analyses/companies/compare",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError(
          "O corpo da comparação não é um JSON válido.",
          400,
        );
      }
      return await stockComparisonController.compare(body, requestId);
    } catch (error) {
      logger.error("stock_comparison_failed", {
        requestId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 502;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível comparar as empresas agora.";
      const headers = new Headers({ "x-request-id": requestId });
      if (error instanceof ApplicationError && error.retryAfterSeconds != null)
        headers.set("retry-after", String(error.retryAfterSeconds));
      return Response.json({ message, requestId }, { status, headers });
    }
  },
);
