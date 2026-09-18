import { ApplicationError } from "@/backend/errors/application-error";
import { cdbRateRepository } from "@/backend/repositories/cdb-rate.repository";
import { logger } from "@/infrastructure/logging/logger";

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

export class CdbRateService {
  async configureOne(
    body: { assetCode?: unknown; cdiPercentage?: unknown },
    requestId?: string,
  ) {
    const assetCode = parseAssetCode(body.assetCode);
    const cdiPercentage = parsePercentage(body.cdiPercentage);
    logger.info("cdb_rate_configuring", { requestId, assetCode });
    const configuration = await cdbRateRepository.upsert(
      assetCode,
      cdiPercentage,
    );
    logger.info("cdb_rate_configured", { requestId, assetCode });
    return configuration;
  }
  async configureMany(
    body: { assetCodes?: unknown; cdiPercentage?: unknown },
    requestId?: string,
  ) {
    if (
      !Array.isArray(body.assetCodes) ||
      !body.assetCodes.every((code): code is string => typeof code === "string")
    )
      throw new ApplicationError("Informe os CDBs a configurar.", 400);
    const assetCodes = [...new Set(body.assetCodes.map(parseAssetCode))];
    const cdiPercentage = parsePercentage(body.cdiPercentage);
    logger.info("cdb_rates_configuring", {
      requestId,
      assets: assetCodes.length,
    });
    const configured = await cdbRateRepository.upsertMany(
      assetCodes,
      cdiPercentage,
    );
    logger.info("cdb_rates_configured", { requestId, configured });
    return { configured };
  }
}
export const cdbRateService = new CdbRateService();
