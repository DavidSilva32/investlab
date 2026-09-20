import { ApplicationError } from "@/backend/errors/application-error";

import { importService } from "@/backend/services/import.service";
import { logger } from "@/infrastructure/logging/logger";

export class ImportController {
  private async readFile(request: Request) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      throw new ApplicationError("Selecione um arquivo para importar.", 400);
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      referenceDate: formData.get("referenceDate"),
    };
  }

  async preview(request: Request, requestId: string) {
    logger.info("b3_import_preview_started", { requestId });
    const { referenceDate: _referenceDate, ...file } =
      await this.readFile(request);
    const preview = importService.preview(file);
    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.movements.length;
    logger.info("b3_import_format_recognized", {
      requestId,
      documentType: preview.documentType,
    });
    logger.info("b3_import_records_parsed", { requestId, records: count });
    return Response.json({ ...preview, count });
  }

  async confirm(request: Request, requestId: string) {
    logger.info("b3_import_confirm_started", { requestId });
    const { referenceDate, ...file } = await this.readFile(request);
    const { preview, result, duplicate } = await importService.confirm(
      file,
      requestId,
      typeof referenceDate === "string" ? referenceDate : null,
    );
    if (duplicate)
      logger.warn("b3_import_duplicate_detected", {
        requestId,
        fileHashPrefix: preview.hash.slice(0, 12),
      });

    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.movements.length;
    return Response.json(
      {
        importId: result.importId,
        count,
        documentType: preview.documentType,
        message:
          preview.documentType === "B3_POSITION_XLSX"
            ? `${count} posição(ões) importada(s) com sucesso.`
            : `${count} movimentação(ões) importada(s) com sucesso.`,
      },
      { status: 201 },
    );
  }

  async delete(documentType: string | null, requestId: string) {
    const deletedImports = await importService.delete(documentType, requestId);
    logger.info("b3_imports_deleted", {
      requestId,
      documentType,
      deletedImports,
    });
    return Response.json({ deletedImports });
  }
}
export const importController = new ImportController();
