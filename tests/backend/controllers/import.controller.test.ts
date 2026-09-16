import { beforeEach, describe, expect, it, vi } from "vitest";

const { repository, service } = vi.hoisted(() => ({
  repository: { existsByHash: vi.fn(), create: vi.fn() },
  service: { preview: vi.fn(), assertCanBeConfirmed: vi.fn() },
}));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
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

describe("ImportController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.preview.mockReturnValue({
      hash: "a".repeat(64),
      documentType: "B3_POSITION_XLSX",
      positions: [{ product: "Ativo", quantity: "1" }],
    });
  });

  it("returns a position preview without persistence", async () => {
    const response = await importController.preview(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      documentType: "B3_POSITION_XLSX",
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("returns a movement preview", async () => {
    service.preview.mockReturnValue({
      hash: "a".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }],
    });
    const response = await importController.preview(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      documentType: "B3_MOVEMENT_XLSX",
    });
  });

  it("persists a non-duplicate confirmation", async () => {
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "import-1" });
    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );
    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ documentType: "B3_POSITION_XLSX" }),
      "request-1",
    );
  });

  it("confirms a non-duplicate movement import", async () => {
    service.preview.mockReturnValue({
      hash: "b".repeat(64),
      documentType: "B3_MOVEMENT_XLSX",
      movements: [{ product: "CDB" }],
    });
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({ importId: "movement-import" });
    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );
    await expect(response.json()).resolves.toMatchObject({
      importId: "movement-import",
      count: 1,
      documentType: "B3_MOVEMENT_XLSX",
    });
  });
  it("rejects a duplicate confirmation", async () => {
    repository.existsByHash.mockResolvedValue(true);
    service.assertCanBeConfirmed.mockImplementation(() => {
      throw new Error("duplicate");
    });
    await expect(
      importController.confirm(requestWithFile(), "request-1"),
    ).rejects.toThrow("duplicate");
  });

  it("rejects a form field that is not a file", async () => {
    const form = new FormData();
    form.append("file", "not-a-file");
    await expect(
      importController.preview(
        new Request("http://test/import", { method: "POST", body: form }),
        "request-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
  it("requires a file in the form data", async () => {
    await expect(
      importController.preview(
        new Request("http://test/import", {
          method: "POST",
          body: new FormData(),
        }),
        "request-1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
