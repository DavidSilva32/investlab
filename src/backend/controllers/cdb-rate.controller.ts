import { logger } from "@/infrastructure/logging/logger";
import { cdbRateService } from "@/backend/services/cdb-rate.service";

export class CdbRateController {
  async update(
    body: { assetCode?: unknown; cdiPercentage?: unknown },
    requestId: string,
  ) {
    logger.info("cdb_rate_update_requested", { requestId });
    const configuration = await cdbRateService.configureOne(body, requestId);
    logger.info("cdb_rate_update_responded", {
      requestId,
      assetCode: configuration.assetCode,
    });
    return Response.json({
      ...configuration,
      message: "Taxa CDI atualizada com sucesso.",
    });
  }

  async create(
    body: { assetCodes?: unknown; cdiPercentage?: unknown },
    requestId: string,
  ) {
    logger.info("cdb_rate_bulk_update_requested", {
      requestId,
      requestedAssets: Array.isArray(body.assetCodes)
        ? body.assetCodes.length
        : undefined,
    });
    const result = await cdbRateService.configureMany(body, requestId);
    logger.info("cdb_rate_bulk_update_responded", {
      requestId,
      configured: result.configured,
    });
    return Response.json({
      ...result,
      message: `Taxas CDI atualizadas com sucesso para ${result.configured} CDB(s).`,
    });
  }
}

export const cdbRateController = new CdbRateController();
