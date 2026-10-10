import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string, operation: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("portfolio_objectives_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível carregar os objetivos."
          : "Não foi possível salvar os objetivos.",
    },
    { status: expected ? error.statusCode : 500 },
  );
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio/objectives",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioObjectivesController.get(requestId);
    } catch (error) {
      return failure(error, requestId, "read");
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/objectives",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioObjectivesController.create(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "create");
    }
  },
);

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/portfolio/objectives",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioObjectivesController.updateAssignments(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "update");
    }
  },
);

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/portfolio/objectives",
  async function PUT(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioObjectivesController.update(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "update");
    }
  },
);

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/portfolio/objectives",
  async function DELETE(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const objectiveId = new URL(request.url).searchParams.get("objectiveId");
      return await portfolioObjectivesController.delete(
        objectiveId ?? "",
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "delete");
    }
  },
);
