import { randomUUID } from "node:crypto";
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

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioObjectivesController.get(requestId);
  } catch (error) {
    return failure(error, requestId, "read");
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioObjectivesController.create(
      await request.json(),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "create");
  }
}

export async function PATCH(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioObjectivesController.updateAssignments(
      await request.json(),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "update");
  }
}

export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioObjectivesController.update(
      await request.json(),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "update");
  }
}

export async function DELETE(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const objectiveId = new URL(request.url).searchParams.get("objectiveId");
    return await portfolioObjectivesController.delete(
      objectiveId ?? "",
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "delete");
  }
}
