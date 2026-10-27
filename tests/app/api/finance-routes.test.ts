import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const state = vi.hoisted(() => ({
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  getEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  getOverview: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/backend/controllers/financial.controller", () => ({
  financialController: {
    getCategories: state.getCategories,
    createCategory: state.createCategory,
    updateCategory: state.updateCategory,
    deleteCategory: state.deleteCategory,
    getEntries: state.getEntries,
    createEntry: state.createEntry,
    updateEntry: state.updateEntry,
    deleteEntry: state.deleteEntry,
    getOverview: state.getOverview,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { warn: state.warn, error: state.error },
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-test",
  withApiRequestLogging: (_method: string, _path: string, handler: unknown) =>
    handler,
}));

import {
  DELETE as deleteCategories,
  GET as getCategories,
  PATCH as patchCategories,
  POST as postCategories,
} from "@/app/api/financial-categories/route";
import {
  DELETE as deleteEntries,
  GET as getEntries,
  PATCH as patchEntries,
  POST as postEntries,
} from "@/app/api/financial-entries/route";
import { GET as getOverview } from "@/app/api/finance-overview/route";

function request(method: string, path: string) {
  return new Request(`http://localhost${path}`, {
    method,
    ...(method === "GET" || method === "DELETE"
      ? {}
      : { body: "{}", headers: { "content-type": "application/json" } }),
  });
}

describe("financial API routes", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates successful category and entry operations with safe error handling", async () => {
    const cases = [
      [
        getCategories,
        state.getCategories,
        "GET",
        "/api/financial-categories",
        "categories",
      ],
      [
        postCategories,
        state.createCategory,
        "POST",
        "/api/financial-categories",
        "write",
      ],
      [
        patchCategories,
        state.updateCategory,
        "PATCH",
        "/api/financial-categories",
        "write",
      ],
      [
        deleteCategories,
        state.deleteCategory,
        "DELETE",
        "/api/financial-categories?id=category-id",
        "write",
      ],
      [
        getEntries,
        state.getEntries,
        "GET",
        "/api/financial-entries?month=2026-10",
        "read",
      ],
      [
        postEntries,
        state.createEntry,
        "POST",
        "/api/financial-entries",
        "write",
      ],
      [
        patchEntries,
        state.updateEntry,
        "PATCH",
        "/api/financial-entries",
        "write",
      ],
      [
        deleteEntries,
        state.deleteEntry,
        "DELETE",
        "/api/financial-entries?id=entry-id",
        "write",
      ],
      [
        getOverview,
        state.getOverview,
        "GET",
        "/api/finance-overview?month=2026-10",
        "overview",
      ],
    ] as const;

    for (const [handler, controller, method, path, kind] of cases) {
      controller.mockResolvedValueOnce(Response.json({ ok: true }));
      const response = await handler(request(method, path));
      expect(response.status).toBe(200);
      if (kind === "read") {
        const month = new URL(`http://localhost${path}`).searchParams.get(
          "month",
        );
        expect(controller).toHaveBeenCalledWith(month, "request-test");
      } else if (kind === "categories") {
        expect(controller).toHaveBeenCalledWith("request-test");
      } else if (kind === "overview") {
        expect(controller).toHaveBeenCalledWith("2026-10", "request-test");
      } else if (method === "DELETE") {
        expect(controller).toHaveBeenCalledWith(
          new URL(`http://localhost${path}`).searchParams.get("id"),
          "request-test",
        );
      } else {
        expect(controller).toHaveBeenCalledWith({}, "request-test");
      }
    }
  });

  it("keeps expected and unexpected errors client-safe across each operation", async () => {
    const cases = [
      [
        getCategories,
        state.getCategories,
        "GET",
        "/api/financial-categories",
        "Não foi possível carregar as categorias.",
      ],
      [
        postCategories,
        state.createCategory,
        "POST",
        "/api/financial-categories",
        "Não foi possível salvar a categoria.",
      ],
      [
        patchCategories,
        state.updateCategory,
        "PATCH",
        "/api/financial-categories",
        "Não foi possível salvar a categoria.",
      ],
      [
        deleteCategories,
        state.deleteCategory,
        "DELETE",
        "/api/financial-categories?id=category-id",
        "Não foi possível salvar a categoria.",
      ],
      [
        getEntries,
        state.getEntries,
        "GET",
        "/api/financial-entries?month=2026-10",
        "Não foi possível carregar os lançamentos.",
      ],
      [
        postEntries,
        state.createEntry,
        "POST",
        "/api/financial-entries",
        "Não foi possível salvar o lançamento.",
      ],
      [
        patchEntries,
        state.updateEntry,
        "PATCH",
        "/api/financial-entries",
        "Não foi possível salvar o lançamento.",
      ],
      [
        deleteEntries,
        state.deleteEntry,
        "DELETE",
        "/api/financial-entries?id=entry-id",
        "Não foi possível salvar o lançamento.",
      ],
      [
        getOverview,
        state.getOverview,
        "GET",
        "/api/finance-overview?month=2026-10",
        "Não foi possível carregar o resumo financeiro.",
      ],
    ] as const;

    for (const [handler, controller, method, path, fallback] of cases) {
      controller.mockRejectedValueOnce(
        new ApplicationError("Dados inválidos.", 400),
      );
      const expected = await handler(request(method, path));
      expect(expected.status).toBe(400);
      expect(await expected.json()).toEqual({ message: "Dados inválidos." });
      expect(state.warn).toHaveBeenCalled();

      controller.mockRejectedValueOnce(new Error("private database details"));
      const unexpected = await handler(request(method, path));
      expect(unexpected.status).toBe(500);
      expect(await unexpected.json()).toEqual({ message: fallback });
      expect(state.error).toHaveBeenCalled();
    }
  });
});
