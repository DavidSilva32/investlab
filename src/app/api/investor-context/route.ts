import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { investorContextController } from "@/backend/controllers/investor-context.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(
  error: unknown,
  requestId: string,
  operation: "read" | "save",
) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("investor_context_failed", {
    requestId,
    operation,
    errorType: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível consultar seu contexto."
          : "Não foi possível salvar seu contexto.",
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
    const result = await investorContextController.get(requestId);
    return Response.json(result, {
      headers: {
        "x-request-id": requestId,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return failure(error, requestId, "read");
  }
}

export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("O corpo da solicitação é inválido.", 400);
    }
    const result = await investorContextController.update(body, requestId);
    return Response.json(result, {
      headers: { "x-request-id": requestId },
    });
  } catch (error) {
    return failure(error, requestId, "save");
  }
}
