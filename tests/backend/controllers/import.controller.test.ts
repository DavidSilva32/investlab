import { beforeEach, describe, expect, it, vi } from "vitest";

const { service, logger } = vi.hoisted(() => ({
  service: {
    preview: vi.fn(),
    previewWithIdentityConflicts: vi.fn(),
    confirm: vi.fn(),
    delete: vi.fn(),
    reconciliationSummary: vi.fn(),
    saveReconciliationDecisions: vi.fn(),
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/backend/services/import.service", () => ({
  importService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger,
}));

import { importController } from "@/backend/controllers/import.controller";
import { logger as loggerInstance } from "@/infrastructure/logging/logger";

function requestWithFile() {
  const form = new FormData();
  form.append(
    "file",
    new File(["content"], "b3.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return new Request("http://test/import", { method: "POST", body: form });
}

const preview = {
  hash: "a".repeat(64),
  documentType: "B3_POSITION_XLSX" as const,
  positions: [{ product: "Ativo", quantity: "1" }],
};

describe("ImportController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.preview.mockReturnValue(preview);
    service.previewWithIdentityConflicts.mockResolvedValue(preview);
    service.confirm.mockResolvedValue({
      preview,
      result: { importId: "import-1" },
      duplicate: false,
    });
    service.reconciliationSummary.mockResolvedValue({ candidates: [] });
    service.saveReconciliationDecisions.mockResolvedValue({ confirmed: [] });
  });

  it("returns the reconciliation summary", async () => {
    const response = await importController.reconciliationSummary("request-1");
    await expect(response.json()).resolves.toEqual({ candidates: [] });
    expect(service.reconciliationSummary).toHaveBeenCalledWith("request-1");
  });

  it("parses and validates reconciliation decisions through the service", async () => {
    const request = new Request("http://test/reconciliation", {
      method: "POST",
      body: JSON.stringify({ decisions: [] }),
      headers: { "content-type": "application/json" },
    });
    const response = await importController.saveReconciliationDecisions(
      request,
      "request-2",
    );
    await expect(response.json()).resolves.toMatchObject({
      confirmed: [],
      message: "Reconciliação atualizada.",
    });
    expect(service.saveReconciliationDecisions).toHaveBeenCalledWith(
      { decisions: [] },
      "request-2",
    );
    await expect(
      importController.saveReconciliationDecisions(
        new Request("http://test/reconciliation", {
          method: "POST",
          body: "invalid",
        }),
        "request-3",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("delegates delete to the service", async () => {
    service.delete.mockResolvedValue(2);
    const response = await importController.delete(
      "B3_MOVEMENT_XLSX",
      "request-1",
    );
    await expect(response.json()).resolves.toEqual({ deletedImports: 2 });
    expect(service.delete).toHaveBeenCalledWith(
      "B3_MOVEMENT_XLSX",
      "request-1",
      null,
    );
  });

  it("returns an individual deletion result and logs the deleted item", async () => {
    service.delete.mockResolvedValue({ message: "Movimentação excluída." });

    const response = await importController.delete(
      "B3_MOVEMENT_XLSX",
      "request-2",
      "movement-1",
    );

    await expect(response.json()).resolves.toEqual({
      message: "Movimentação excluída.",
    });
    expect(service.delete).toHaveBeenCalledWith(
      "B3_MOVEMENT_XLSX",
      "request-2",
      "movement-1",
    );
    expect(loggerInstance.info).toHaveBeenCalledWith("b3_import_item_deleted", {
      requestId: "request-2",
      documentType: "B3_MOVEMENT_XLSX",
      itemId: "movement-1",
    });
  });

  it("propagates service validation", async () => {
    service.delete.mockRejectedValue({ statusCode: 400 });
    await expect(
      importController.delete("other", "request-1"),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns a preview", async () => {
    const response = await importController.preview(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({ count: 1 });
  });

  it("delegates confirmation", async () => {
    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );
    expect(response.status).toBe(201);
    expect(service.confirm).toHaveBeenCalled();
  });

  it("counts and confirms negotiation rows with a document-specific message", async () => {
    const tradePreview = {
      hash: "d".repeat(64),
      documentType: "B3_TRADING_XLSX" as const,
      trades: [{ product: "ABCD3" }, { product: "WXYZ4" }],
    };
    service.previewWithIdentityConflicts.mockResolvedValue(tradePreview);
    const previewResponse = await importController.preview(
      requestWithFile(),
      "request-trade",
    );
    await expect(previewResponse.json()).resolves.toMatchObject({ count: 2 });

    service.confirm.mockResolvedValue({
      preview: tradePreview,
      result: { importId: "trade-import" },
      duplicate: false,
    });
    const confirmResponse = await importController.confirm(
      requestWithFile(),
      "request-trade",
    );
    await expect(confirmResponse.json()).resolves.toMatchObject({
      count: 2,
      documentType: "B3_TRADING_XLSX",
      message: "2 negociação(ões) importada(s) com sucesso.",
    });
  });

  it("reports when duplicate positions receive a confirmed CURVA base date", async () => {
    service.confirm.mockResolvedValue({
      preview,
      result: { importId: "import-1" },
      duplicate: true,
      referenceDateUpdated: true,
    });

    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );

    await expect(response.json()).resolves.toMatchObject({
      message: "Data exibida na B3 atualizada para as posições já importadas.",
    });
  });

  it("returns an explicit no-new-position response when an identical file is reprocessed", async () => {
    service.confirm.mockResolvedValue({
      preview,
      result: {
        importId: "import-1",
        snapshotId: "snapshot-1",
        enrichedPositionCount: 2,
      },
      duplicate: true,
      reprocessedExistingImport: true,
    });

    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enrichedPositionCount: 2,
      message:
        "2 posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.",
    });
  });

  it("reports an idempotent no-op when reprocessing enriches zero positions", async () => {
    service.confirm.mockResolvedValue({
      preview,
      result: { importId: "import-1", enrichedPositionCount: 0 },
      duplicate: true,
      reprocessedExistingImport: true,
    });

    const response = await importController.confirm(
      requestWithFile(),
      "request-noop",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enrichedPositionCount: 0,
      message:
        "Arquivo idêntico revisado. Não havia campos ausentes para enriquecer e nenhuma nova posição foi criada.",
    });
  });

  it("reports a newly registered legacy date even when no position was enriched", async () => {
    service.confirm.mockResolvedValue({
      preview,
      result: {
        importId: "import-1",
        enrichedPositionCount: 0,
        referenceDateUpdated: true,
      },
      duplicate: true,
      referenceDateUpdated: true,
      reprocessedExistingImport: true,
    });

    const response = await importController.confirm(
      requestWithFile(),
      "request-legacy-date",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      enrichedPositionCount: 0,
      message:
        "Data exibida na B3 registrada no snapshot legado. Nenhuma posição precisou de enriquecimento.",
    });
  });

  it("reports both a newly registered legacy date and enriched positions", async () => {
    service.confirm.mockResolvedValue({
      preview,
      result: {
        importId: "import-1",
        enrichedPositionCount: 2,
        referenceDateUpdated: true,
      },
      duplicate: true,
      referenceDateUpdated: true,
      reprocessedExistingImport: true,
    });

    const response = await importController.confirm(
      requestWithFile(),
      "request-legacy-date-enriched",
    );

    await expect(response.json()).resolves.toMatchObject({
      enrichedPositionCount: 2,
      message:
        "Data exibida na B3 registrada e 2 posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.",
    });
  });

  it("rejects requests without a file and counts movement records", async () => {
    await expect(
      importController.preview(
        new Request("http://test/import", {
          method: "POST",
          body: new FormData(),
        }),
        "request-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    service.previewWithIdentityConflicts.mockResolvedValue({
      hash: "b".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }, { product: "LCI" }],
    });
    const response = await importController.preview(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({ count: 2 });
  });

  it("logs duplicate movement confirmations", async () => {
    const movementPreview = {
      hash: "c".repeat(64),
      documentType: "B3_MOVEMENT_XLSX" as const,
      movements: [{ product: "CDB" }],
    };
    service.confirm.mockResolvedValue({
      preview: movementPreview,
      result: { importId: "import-2" },
      duplicate: true,
    });
    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({ count: 1 });
  });
});

describe("ImportController reference date handling", () => {
  it("passes a supplied date to the import service", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File(["content"], "b3.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    form.append("referenceDate", "2026-09-18");
    service.confirm.mockResolvedValue({
      preview,
      result: { importId: "import-1" },
      duplicate: false,
    });

    await importController.confirm(
      new Request("http://test/import", { method: "POST", body: form }),
      "request-1",
    );

    expect(service.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ name: "b3.xlsx" }),
      "request-1",
      "2026-09-18",
      undefined,
    );
  });
});

describe("ImportController reconciliation transport", () => {
  it("rejects invalid JSON or a file masquerading as decisions", async () => {
    for (const value of ["{", new File(["x"], "decisions.json")]) {
      const form = new FormData();
      form.append("file", new File(["x"], "b3.xlsx"));
      form.append("reconciliationDecisions", value);
      await expect(
        importController.confirm(
          new Request("http://test", { method: "POST", body: form }),
          "r",
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    }
  });
  it("passes explicit decisions with the file to the service", async () => {
    const decisions = [{ manualAssetKey: "manual:1", action: "link" }];
    const form = new FormData();
    form.append("file", new File(["x"], "b3.xlsx"));
    form.append("reconciliationDecisions", JSON.stringify(decisions));
    service.confirm.mockResolvedValue({
      preview: { hash: "a", documentType: "B3_POSITION_XLSX", positions: [] },
      result: { importId: "i" },
      duplicate: false,
    });
    await importController.confirm(
      new Request("http://test", { method: "POST", body: form }),
      "r",
    );
    expect(service.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "b3.xlsx" }),
      "r",
      null,
      decisions,
    );
  });
});
