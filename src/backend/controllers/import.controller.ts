import { ApplicationError } from "@/backend/errors/application-error";

import { importService } from "@/backend/services/import.service";
import { logger } from "@/infrastructure/logging/logger";

export class ImportController {
  async reconciliationSummary(requestId: string) {
    return Response.json(await importService.reconciliationSummary(requestId));
  }

  async saveReconciliationDecisions(request: Request, requestId: string) {
    let decisions: unknown;
    try {
      decisions = await request.json();
    } catch {
      throw new ApplicationError("Decisões de conciliação inválidas.", 400);
    }
    const summary = await importService.saveReconciliationDecisions(
      decisions,
      requestId,
    );
    return Response.json({ ...summary, message: "Reconciliação atualizada." });
  }

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
      reconciliationDecisions: formData.get("reconciliationDecisions"),
    };
  }

  async preview(request: Request, requestId: string) {
    logger.info("b3_import_preview_started", { requestId });
    const {
      referenceDate: _referenceDate,
      reconciliationDecisions: _decisions,
      ...file
    } = await this.readFile(request);
    const preview = await importService.previewWithIdentityConflicts(
      file,
      requestId,
    );
    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.documentType === "B3_MOVEMENT_XLSX"
          ? preview.movements.length
          : preview.trades.length;
    logger.info("b3_import_format_recognized", {
      requestId,
      documentType: preview.documentType,
    });
    logger.info("b3_import_records_parsed", { requestId, records: count });
    return Response.json({ ...preview, count });
  }

  async confirm(request: Request, requestId: string) {
    logger.info("b3_import_confirm_started", { requestId });
    const { referenceDate, reconciliationDecisions, ...file } =
      await this.readFile(request);
    let decisions: unknown;
    if (reconciliationDecisions !== null) {
      if (typeof reconciliationDecisions !== "string")
        throw new ApplicationError("Decisões de conciliação inválidas.", 400);
      try {
        decisions = JSON.parse(reconciliationDecisions);
      } catch {
        throw new ApplicationError("Decisões de conciliação inválidas.", 400);
      }
    }
    const {
      preview,
      result,
      duplicate,
      referenceDateUpdated = false,
      reprocessedExistingImport = false,
    } = await importService.confirm(
      file,
      requestId,
      typeof referenceDate === "string" ? referenceDate : null,
      decisions,
    );
    if (duplicate)
      logger.warn("b3_import_duplicate_detected", {
        requestId,
        fileHashPrefix: preview.hash.slice(0, 12),
      });

    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.documentType === "B3_MOVEMENT_XLSX"
          ? preview.movements.length
          : preview.trades.length;
    const enrichedPositionCount =
      "enrichedPositionCount" in result ? result.enrichedPositionCount : 0;
    return Response.json(
      {
        importId: result.importId,
        count,
        ...(reprocessedExistingImport ? { enrichedPositionCount } : {}),
        documentType: preview.documentType,
        message: referenceDateUpdated
          ? reprocessedExistingImport
            ? enrichedPositionCount
              ? `Data exibida na B3 registrada e ${enrichedPositionCount} posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.`
              : "Data exibida na B3 registrada no snapshot legado. Nenhuma posição precisou de enriquecimento."
            : "Data exibida na B3 atualizada para as posições já importadas."
          : reprocessedExistingImport
            ? enrichedPositionCount
              ? `${enrichedPositionCount} posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.`
              : "Arquivo idêntico revisado. Não havia campos ausentes para enriquecer e nenhuma nova posição foi criada."
            : preview.documentType === "B3_POSITION_XLSX"
              ? `${count} posição(ões) importada(s) com sucesso.`
              : preview.documentType === "B3_MOVEMENT_XLSX"
                ? `${count} movimentação(ões) importada(s) com sucesso.`
                : `${count} negociação(ões) importada(s) com sucesso.`,
      },
      { status: reprocessedExistingImport ? 200 : 201 },
    );
  }

  async delete(
    documentType: string | null,
    requestId: string,
    itemId: string | null = null,
  ) {
    const result = await importService.delete(documentType, requestId, itemId);
    if (typeof result === "number") {
      logger.info("b3_imports_deleted", {
        requestId,
        documentType,
        deletedImports: result,
      });
      return Response.json({ deletedImports: result });
    }
    logger.info("b3_import_item_deleted", { requestId, documentType, itemId });
    return Response.json(result);
  }
}
export const importController = new ImportController();
