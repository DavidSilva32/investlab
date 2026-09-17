import { beforeEach, describe, expect, it, vi } from "vitest";

const { service } = vi.hoisted(() => ({
  service: { preview: vi.fn(), confirm: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/backend/services/import.service", () => ({
  importService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { importController } from "@/backend/controllers/import.controller";

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
    );
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
    service.preview.mockReturnValue({
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
