import { screenerMarketController } from "@/backend/controllers/screener-market.controller";
import { screenerSyncController } from "@/backend/controllers/screener-sync.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import { hasValidCronAuthorization } from "@/infrastructure/auth/cron-authorization";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const maximumMarketBatches = 500;
const responseDeadlineMarginMs = 20_000;

type Task = "fundamentals" | "market";
type RouteContext = { params: Promise<{ task: string }> };

async function refreshMarketUntilComplete(requestId: string) {
  const startedAt = Date.now();
  let batchCount = 0;
  let totalStaleIssuers = 0;
  let attemptedIssuers = 0;
  let updatedIssuers = 0;
  let unavailableIssuers = 0;
  let remainingIssuers = 1;
  let completedAt: string | null = null;

  while (remainingIssuers > 0) {
    if (
      batchCount >= maximumMarketBatches ||
      Date.now() - startedAt >= 300_000 - responseDeadlineMarginMs
    ) {
      throw new ApplicationError(
        "A atualização de mercado excedeu o tempo disponível e continuará na próxima execução.",
        503,
      );
    }

    const result = await screenerMarketController.refresh(requestId);
    batchCount += 1;
    if (batchCount === 1) totalStaleIssuers = result.totalStaleIssuers;
    attemptedIssuers += result.attemptedIssuers;
    updatedIssuers += result.updatedIssuers;
    unavailableIssuers += result.unavailableIssuers;
    remainingIssuers = result.remainingIssuers;
    completedAt = result.completedAt;

    if (remainingIssuers > 0 && result.attemptedIssuers === 0) {
      throw new ApplicationError(
        "A atualização de mercado não avançou; será retomada na próxima execução.",
        503,
      );
    }
  }

  return {
    batchCount,
    totalStaleIssuers,
    attemptedIssuers,
    updatedIssuers,
    unavailableIssuers,
    remainingIssuers,
    completedAt,
  };
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/cron/weekly-screener-sync/[task]",
  async function GET(request: Request, context: RouteContext) {
    const requestId = getApiRequestId(request);
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) {
      return Response.json(
        { message: "A automação semanal não está configurada.", requestId },
        {
          status: 503,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }
    if (!hasValidCronAuthorization(request, secret)) {
      return Response.json(
        { message: "Não autorizado.", requestId },
        {
          status: 401,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }

    const { task } = await context.params;
    if (task !== "fundamentals" && task !== "market") {
      return Response.json(
        { message: "Tarefa não encontrada.", requestId },
        {
          status: 404,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }

    try {
      const result =
        task === "fundamentals"
          ? await screenerSyncController.sync()
          : await refreshMarketUntilComplete(requestId);
      return Response.json(
        { ...result, requestId },
        {
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    } catch (error) {
      logger.error("weekly_screener_sync_route_failed", {
        requestId,
        task: task as Task,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      const status = error instanceof ApplicationError ? error.statusCode : 502;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "A atualização semanal não foi concluída.";
      return Response.json(
        { message, requestId },
        {
          status,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }
  },
);

export const weeklyScreenerSyncRouteInternals = {
  refreshMarketUntilComplete,
  maximumMarketBatches,
};
