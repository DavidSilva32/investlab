import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { cdbRateRepository } from "@/backend/repositories/cdb-rate.repository";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

const parsePercentage = (value: unknown) => {
  const percentage = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 1000)
    throw new ApplicationError("Informe um percentual CDI válido.", 400);
  return percentage.toFixed(4);
};
const parseAssetCode = (value: unknown) => {
  if (typeof value !== "string" || !value.trim())
    throw new ApplicationError("Informe o código do CDB.", 400);
  return value.trim().toUpperCase();
};
const failure = (error: unknown, requestId: string) => {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("cdb_rate_configuration_failed", {
    requestId,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível salvar a configuração.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
};

export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body: { assetCode?: unknown; cdiPercentage?: unknown } =
      await request.json();
    const configuration = await cdbRateRepository.upsert(
      parseAssetCode(body.assetCode),
      parsePercentage(body.cdiPercentage),
    );
    return Response.json(configuration);
  } catch (error) {
    return failure(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body: { assetCodes?: unknown; cdiPercentage?: unknown } =
      await request.json();
    if (
      !Array.isArray(body.assetCodes) ||
      !body.assetCodes.every(
        (assetCode: unknown): assetCode is string =>
          typeof assetCode === "string",
      )
    )
      throw new ApplicationError("Informe os CDBs a configurar.", 400);
    const configured = await cdbRateRepository.configureMissing(
      [...new Set(body.assetCodes.map(parseAssetCode))],
      parsePercentage(body.cdiPercentage),
    );
    return Response.json({ configured });
  } catch (error) {
    return failure(error, requestId);
  }
}
