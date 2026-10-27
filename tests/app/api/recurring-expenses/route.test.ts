import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const state = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  realize: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/backend/controllers/recurring-expenses.controller", () => ({
  recurringExpensesController: {
    get: state.get,
    create: state.create,
    update: state.update,
    realize: state.realize,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { warn: state.warn, error: state.error },
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  getApiRequestId: () => "request-test",
  withApiRequestLogging: (_method: string, _route: string, handler: unknown) =>
    handler,
}));

import { GET, PATCH, POST } from "@/app/api/recurring-expenses/route";
import { PUT } from "@/app/api/recurring-expenses/occurrences/route";

describe("recurring expenses routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("passes the requested month to the controller", async () => {
    state.get.mockResolvedValue(
      Response.json({ expenses: [], occurrences: [] }),
    );
    const response = await GET(
      new Request("http://localhost/api/recurring-expenses?month=2026-10"),
    );
    expect(state.get).toHaveBeenCalledWith("2026-10", "request-test");
    expect(response.status).toBe(200);
  });

  it("returns safe read errors and logs expected and unexpected failures", async () => {
    state.get.mockRejectedValueOnce(new ApplicationError("Mês inválido.", 400));
    const expected = await GET(
      new Request("http://localhost/api/recurring-expenses"),
    );
    expect(expected.status).toBe(400);
    expect(await expected.json()).toEqual({ message: "Mês inválido." });
    expect(state.warn).toHaveBeenCalledWith(
      "recurring_expenses_failed",
      expect.objectContaining({ requestId: "request-test", operation: "read" }),
    );

    state.get.mockRejectedValueOnce(new Error("sensitive database detail"));
    const unexpected = await GET(
      new Request("http://localhost/api/recurring-expenses"),
    );
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      message: "Não foi possível carregar as despesas recorrentes.",
    });
    expect(state.error).toHaveBeenCalledWith(
      "recurring_expenses_failed",
      expect.objectContaining({ operation: "read" }),
    );
  });

  it("creates and updates entries and keeps client-safe errors", async () => {
    state.create.mockResolvedValue(
      Response.json({ id: "created" }, { status: 201 }),
    );
    const created = await POST(
      new Request("http://localhost/api/recurring-expenses", {
        method: "POST",
        body: JSON.stringify({ description: "Energia" }),
      }),
    );
    expect(state.create).toHaveBeenCalledWith(
      { description: "Energia" },
      "request-test",
    );
    expect(created.status).toBe(201);

    state.update.mockRejectedValueOnce(
      new ApplicationError("Revise os dados.", 400),
    );
    const rejected = await PATCH(
      new Request("http://localhost/api/recurring-expenses", {
        method: "PATCH",
        body: JSON.stringify({ id: "invalid" }),
      }),
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ message: "Revise os dados." });

    state.create.mockRejectedValueOnce(new Error("private error"));
    const failed = await POST(
      new Request("http://localhost/api/recurring-expenses", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      message: "Não foi possível salvar a despesa recorrente.",
    });
  });

  it("records a realized occurrence and hides internal failure details", async () => {
    state.realize.mockResolvedValue(Response.json({ id: "occurrence" }));
    const success = await PUT(
      new Request("http://localhost/api/recurring-expenses/occurrences", {
        method: "PUT",
        body: JSON.stringify({ recurringExpenseId: "id", actualAmount: 10 }),
      }),
    );
    expect(state.realize).toHaveBeenCalledWith(
      { recurringExpenseId: "id", actualAmount: 10 },
      "request-test",
    );
    expect(success.status).toBe(200);

    state.realize.mockRejectedValueOnce(
      new ApplicationError("Data incompatível.", 400),
    );
    const expected = await PUT(
      new Request("http://localhost/api/recurring-expenses/occurrences", {
        method: "PUT",
        body: "{}",
      }),
    );
    expect(expected.status).toBe(400);
    expect(await expected.json()).toEqual({ message: "Data incompatível." });

    state.realize.mockRejectedValueOnce(new Error("private failure"));
    const unexpected = await PUT(
      new Request("http://localhost/api/recurring-expenses/occurrences", {
        method: "PUT",
        body: "{}",
      }),
    );
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      message: "Não foi possível registrar o valor realizado.",
    });
    expect(state.error).toHaveBeenCalledWith(
      "recurring_expense_occurrence_failed",
      expect.objectContaining({ operation: "realize" }),
    );
  });
});
