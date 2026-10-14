import { beforeEach, describe, expect, it, vi } from "vitest";

const { service, logger } = vi.hoisted(() => ({
  service: {
    preview: vi.fn(),
    previewWithIdentityConflicts: vi.fn(),
    confirm: vi.fn(),
    delete: vi.fn(),
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
