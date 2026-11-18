import { ApplicationError } from "@/backend/errors/application-error";
import { financialStatementImportService } from "@/backend/services/financial-statement-import.service";
import { logger } from "@/infrastructure/logging/logger";

export class FinancialStatementImportController {
  async preview(request: Request, requestId: string) {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > 5 * 1024 * 1024 + 256 * 1024
    ) {
      throw new ApplicationError("O arquivo deve ter até 5 MB.", 413);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new ApplicationError("Selecione um extrato para revisar.", 400);
    if (file.size > 5 * 1024 * 1024) {
      throw new ApplicationError("O arquivo deve ter até 5 MB.", 413);
    }
    const mappingValue = form.get("mapping");
    let mapping: unknown;
    if (mappingValue !== null) {
      if (typeof mappingValue !== "string")
        throw new ApplicationError("Revise o mapeamento das colunas.", 400);
      try {
        mapping = JSON.parse(mappingValue);
      } catch {
        throw new ApplicationError("Revise o mapeamento das colunas.", 400);
      }
    }
    const result = await financialStatementImportService.preview(
      { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) },
      mapping,
    );
    logger.info("financial_statement_preview_completed", {
      requestId,
      rows: result.rows.length,
      mapped: result.mapping !== null,
    });
    return Response.json(result);
  }

  async confirm(body: unknown, requestId: string) {
    const result = await financialStatementImportService.confirm(body);
    logger.info("financial_statement_import_confirmed", {
      requestId,
      imported: result.importedCount,
      repeated: result.alreadyImportedCount,
      possibleDuplicates: result.possibleDuplicateCount,
    });
    return Response.json(
      {
        ...result,
        message: result.importedCount
          ? `${result.importedCount} lançamento(s) importado(s).`
          : "Este arquivo já havia sido importado; nenhum lançamento novo foi criado.",
      },
      { status: result.importedCount ? 201 : 200 },
    );
  }
}

export const financialStatementImportController =
  new FinancialStatementImportController();
