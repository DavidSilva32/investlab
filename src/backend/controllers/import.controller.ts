import { ApplicationError } from "@/backend/errors/application-error";
import { importRepository } from "@/backend/repositories/import.repository";
import { importService } from "@/backend/services/import.service";
import { logger } from "@/infrastructure/logging/logger";

export class ImportController {
  private async readFile(request: Request) {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File))
      throw new ApplicationError("Selecione um arquivo para importar.", 400);
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    };
  }

  async preview(request: Request, requestId: string) {
    logger.info("b3_import_preview_started", { requestId });
    const preview = importService.preview(await this.readFile(request));
    logger.info("b3_import_format_recognized", {
      requestId,
      documentType: "B3_POSITION_XLSX",
    });
    logger.info("b3_import_records_parsed", {
      requestId,
      records: preview.positions.length,
    });
    logger.info("b3_import_preview_completed", { requestId });
    return Response.json({
      positions: preview.positions,
      count: preview.positions.length,
    });
  }

  async confirm(request: Request, requestId: string) {
    logger.info("b3_import_confirm_started", { requestId });
    const file = await this.readFile(request);
    const preview = importService.preview(file);
    const duplicate = await importRepository.existsByHash(
      preview.hash,
      requestId,
    );
    if (duplicate)
      logger.warn("b3_import_duplicate_detected", {
        requestId,
        fileHashPrefix: preview.hash.slice(0, 12),
      });
    importService.assertCanBeConfirmed(duplicate);
    logger.info("b3_import_persistence_started", {
      requestId,
      records: preview.positions.length,
    });
    const snapshot = await importRepository.create(
      {
        fileName: file.name,
        fileHash: preview.hash,
        positions: preview.positions,
      },
      requestId,
    );
    logger.info("b3_import_confirm_completed", {
      requestId,
      importId: snapshot.importId,
      snapshotId: snapshot.id,
      records: preview.positions.length,
    });
    return Response.json(
      { snapshotId: snapshot.id, count: preview.positions.length },
      { status: 201 },
    );
  }
}

export const importController = new ImportController();
