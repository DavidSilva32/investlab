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
      positions: [{ product: "Ativo", quantity: "1" }],
    });
  });

  it("returns a preview without persistence", async () => {
    const response = await importController.preview(
      requestWithFile(),
      "request-1",
    );
    expect(await response.json()).toMatchObject({ count: 1 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("persists a non-duplicate confirmation", async () => {
    repository.existsByHash.mockResolvedValue(false);
    repository.create.mockResolvedValue({
      id: "snapshot-1",
      importId: "import-1",
    });
    const response = await importController.confirm(
      requestWithFile(),
      "request-1",
    );
    expect(response.status).toBe(201);
    expect(repository.create).toHaveBeenCalled();
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
