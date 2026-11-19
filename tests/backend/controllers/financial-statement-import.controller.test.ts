import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const { service, logger } = vi.hoisted(() => ({
  service: { preview: vi.fn(), confirm: vi.fn() },
  logger: { info: vi.fn() },
}));

vi.mock("@/backend/services/financial-statement-import.service", () => ({
  financialStatementImportService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { FinancialStatementImportController } from "@/backend/controllers/financial-statement-import.controller";

function formRequest(file?: File, contentLength?: string) {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("http://localhost/api/financial-statement-import", {
    method: "POST",
    body: form,
    headers: contentLength ? { "content-length": contentLength } : undefined,
  });
}

describe("FinancialStatementImportController", () => {
  const controller = new FinancialStatementImportController();

  beforeEach(() => {
    vi.resetAllMocks();
    service.preview.mockResolvedValue({ rows: [{ date: "2026-11-01" }] });
    service.confirm.mockResolvedValue({
      importedCount: 2,
      alreadyImportedCount: 0,
      duplicateCount: 0,
      skippedCount: 0,
    });
  });

  it("rejects a request above the multipart size limit before parsing the body", async () => {
    await expect(
      controller.preview(
        formRequest(undefined, String(6 * 1024 * 1024)),
        "req-big",
      ),
    ).rejects.toMatchObject({
      statusCode: 413,
      message: "O arquivo deve ter até 5 MB.",
    });
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("requires a file and enforces the per-file size limit", async () => {
    await expect(
      controller.preview(formRequest(), "req-empty"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Selecione um extrato para revisar.",
    });

    const oversized = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "extrato.csv",
    );
    await expect(
      controller.preview(
        formRequest(oversized, "not-a-number"),
        "req-file-big",
      ),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(service.preview).not.toHaveBeenCalled();
  });

  it("reads the selected file and logs the preview row count", async () => {
    const file = new File(["data"], "inter.csv", { type: "text/csv" });
    const response = await controller.preview(formRequest(file), "req-preview");

    expect(await response.json()).toEqual({ rows: [{ date: "2026-11-01" }] });
    expect(service.preview).toHaveBeenCalledWith({
      name: "inter.csv",
      buffer: Buffer.from("data"),
    });
    expect(logger.info).toHaveBeenCalledWith(
      "financial_statement_preview_completed",
      { requestId: "req-preview", rows: 1, mapped: true },
    );
  });

  it("returns imported and automatically skipped counts", async () => {
    const body = { selections: [] };
    const imported = await controller.confirm(body, "req-confirm");
    expect(imported.status).toBe(201);
    await expect(imported.json()).resolves.toMatchObject({
      importedCount: 2,
      skippedCount: 0,
      message:
        "Importação concluída: 2 novo(s) lançamento(s) importado(s), 0 repetido(s) ignorado(s).",
    });
    expect(service.confirm).toHaveBeenCalledWith(body);

    service.confirm.mockResolvedValueOnce({
      importedCount: 0,
      alreadyImportedCount: 3,
      duplicateCount: 2,
      skippedCount: 5,
    });
    const repeated = await controller.confirm(body, "req-repeat");
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      importedCount: 0,
      skippedCount: 5,
      message:
        "Importação concluída: 0 novo(s) lançamento(s) importado(s), 5 repetido(s) ignorado(s).",
    });
    expect(logger.info).toHaveBeenCalledWith(
      "financial_statement_import_confirmed",
      expect.objectContaining({
        requestId: "req-repeat",
        imported: 0,
        alreadyImported: 3,
        duplicatesSkipped: 2,
      }),
    );
  });

  it("preserves service validation errors from confirmation", async () => {
    service.confirm.mockRejectedValueOnce(
      new ApplicationError("Revise as linhas selecionadas.", 422),
    );

    await expect(controller.confirm({}, "req-invalid")).rejects.toMatchObject({
      statusCode: 422,
      message: "Revise as linhas selecionadas.",
    });
  });
});
