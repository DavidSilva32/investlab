import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  updateReason: vi.fn(),
  addObservation: vi.fn(),
  updateObservation: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/backend/controllers/study-list.controller", () => ({
  studyListController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { ApplicationError } from "@/backend/errors/application-error";
import { GET, POST } from "@/app/api/study-list/route";
import {
  DELETE,
  PATCH as UPDATE_REASON,
} from "@/app/api/study-list/[cnpj]/route";
import { POST as ADD_NOTE } from "@/app/api/study-list/[cnpj]/observations/route";
import { PATCH } from "@/app/api/study-list/[cnpj]/observations/[observationId]/route";

function request(method: string, body?: string, requestId = "request-1") {
  return new Request("http://localhost/api/study-list", {
    method,
    headers: {
      "x-request-id": requestId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body }),
  });
}

function requestWithoutId(method: string, body?: string) {
  return new Request("http://localhost/api/study-list", {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body,
        }),
  });
}
const context = {
  params: Promise.resolve({
    cnpj: "12345678000199",
    observationId: "00000000-0000-4000-8000-000000000001",
  }),
};

describe("study-list route handlers", () => {
  beforeEach(() => vi.resetAllMocks());

  it("delegates list and add requests to the controller", async () => {
    controller.list.mockResolvedValueOnce(Response.json({ entries: [] }));
    controller.add.mockResolvedValueOnce(
      Response.json({ added: true }, { status: 201 }),
    );

    expect((await GET(request("GET"))).status).toBe(200);
    expect(controller.list).toHaveBeenCalledWith("request-1");
    expect(
      (await POST(request("POST", JSON.stringify({ issuerCnpj: "123" }))))
        .status,
    ).toBe(201);
    expect(controller.add).toHaveBeenCalledWith(
      { issuerCnpj: "123" },
      "request-1",
    );
  });

  it("generates a request id when callers do not send one", async () => {
    controller.list.mockResolvedValueOnce(Response.json({ entries: [] }));
    controller.add.mockResolvedValueOnce(
      Response.json({ added: true }, { status: 201 }),
    );
    controller.remove.mockResolvedValueOnce(Response.json({ removed: true }));
    controller.updateReason.mockResolvedValueOnce(
      Response.json({ reason: "Motivo atualizado." }),
    );
    controller.addObservation.mockResolvedValueOnce(
      Response.json({ observation: {} }, { status: 201 }),
    );
    controller.updateObservation.mockResolvedValueOnce(
      Response.json({ observation: {} }),
    );

    expect((await GET(requestWithoutId("GET"))).status).toBe(200);
    const postResponse = await POST(requestWithoutId("POST", "{}"));
    expect(postResponse.status).toBe(201);
    expect(controller.add.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await DELETE(requestWithoutId("DELETE"), context)).status).toBe(
      200,
    );
    expect(
      (await UPDATE_REASON(requestWithoutId("PATCH", "{}"), context)).status,
    ).toBe(200);
    expect(
      (await ADD_NOTE(requestWithoutId("POST", "{}"), context)).status,
    ).toBe(201);
    expect((await PATCH(requestWithoutId("PATCH", "{}"), context)).status).toBe(
      200,
    );
  });
  it("returns a generic read error and logs only error type and request id", async () => {
    controller.list.mockRejectedValueOnce(new Error("database detail"));
    const response = await GET(request("GET"));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível carregar a Lista de estudo agora.",
      requestId: "request-1",
    });
    expect(logger.error).toHaveBeenCalledWith("study_list_load_failed", {
      requestId: "request-1",
      errorType: "Error",
    });

    controller.list.mockRejectedValueOnce("non-error");
    await GET(request("GET"));
    expect(logger.error).toHaveBeenLastCalledWith("study_list_load_failed", {
      requestId: "request-1",
      errorType: "unknown",
    });
  });

  it("maps invalid add requests and malformed JSON to client-safe responses", async () => {
    controller.add.mockRejectedValueOnce(
      new ApplicationError("Revise os dados.", 422),
    );
    const expectedError = await POST(request("POST", "{}"));
    expect(expectedError.status).toBe(422);
    await expect(expectedError.json()).resolves.toMatchObject({
      message: "Revise os dados.",
    });

    controller.add.mockRejectedValueOnce("unexpected");
    const fallback = await POST(request("POST", "{}"));
    expect(fallback.status).toBe(502);
    await expect(fallback.json()).resolves.toMatchObject({
      message: "Não foi possível adicionar a empresa à Lista de estudo.",
    });

    const invalidJson = await POST(request("POST", "{"));
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toMatchObject({
      message: "Envie um corpo JSON válido.",
    });
    expect(controller.add).toHaveBeenCalledTimes(2);
  });

  it("returns 400 for malformed JSON across every mutation body", async () => {
    const malformed = "{";
    const responses = await Promise.all([
      POST(request("POST", malformed)),
      UPDATE_REASON(request("PATCH", malformed), context),
      ADD_NOTE(request("POST", malformed), context),
      PATCH(request("PATCH", malformed), context),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400, 400,
    ]);
    expect(controller.add).not.toHaveBeenCalled();
    expect(controller.updateReason).not.toHaveBeenCalled();
    expect(controller.addObservation).not.toHaveBeenCalled();
    expect(controller.updateObservation).not.toHaveBeenCalled();
  });

  it("updates a reason and returns safe validation and fallback errors", async () => {
    controller.updateReason.mockResolvedValueOnce(
      Response.json({ reason: "Motivo atualizado." }),
    );
    const updated = await UPDATE_REASON(
      request("PATCH", JSON.stringify({ reason: "Motivo" })),
      context,
    );
    expect(updated.status).toBe(200);
    expect(controller.updateReason).toHaveBeenCalledWith(
      "12345678000199",
      { reason: "Motivo" },
      "request-1",
    );

    controller.updateReason.mockRejectedValueOnce(
      new ApplicationError("Revise o motivo.", 400),
    );
    expect((await UPDATE_REASON(request("PATCH", "{}"), context)).status).toBe(
      400,
    );

    controller.updateReason.mockRejectedValueOnce("unexpected");
    const fallback = await UPDATE_REASON(request("PATCH", "{}"), context);
    expect(fallback.status).toBe(502);
    await expect(fallback.json()).resolves.toMatchObject({
      message: "Não foi possível atualizar o motivo da inclusão.",
      requestId: "request-1",
    });
  });

  it("deletes an entry and handles expected and unexpected failures", async () => {
    controller.remove.mockResolvedValueOnce(Response.json({ removed: true }));
    controller.updateReason.mockResolvedValueOnce(
      Response.json({ reason: "Motivo atualizado." }),
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(200);
    expect(controller.remove).toHaveBeenCalledWith(
      "12345678000199",
      "request-1",
    );

    controller.remove.mockRejectedValueOnce(
      new ApplicationError("Não encontrada.", 404),
    );
    expect((await DELETE(request("DELETE"), context)).status).toBe(404);
    controller.remove.mockRejectedValueOnce("unexpected");
    const fallback = await DELETE(request("DELETE"), context);
    expect(fallback.status).toBe(502);
    await expect(fallback.json()).resolves.toMatchObject({
      message: "Não foi possível remover a empresa da Lista de estudo.",
    });
  });

  it("adds observations and maps both failure types", async () => {
    controller.addObservation.mockResolvedValueOnce(
      Response.json({ observation: { id: "note-1" } }, { status: 201 }),
    );
    expect((await ADD_NOTE(request("POST", "{}"), context)).status).toBe(201);
    controller.addObservation.mockRejectedValueOnce(
      new ApplicationError("A empresa não está na lista.", 404),
    );
    expect((await ADD_NOTE(request("POST", "{}"), context)).status).toBe(404);
    controller.addObservation.mockRejectedValueOnce("unexpected");
    const fallback = await ADD_NOTE(request("POST", "{}"), context);
    expect(fallback.status).toBe(502);
    await expect(fallback.json()).resolves.toMatchObject({
      message: "Não foi possível registrar a observação.",
    });
  });

  it("updates observations without leaking unexpected errors", async () => {
    controller.updateObservation.mockResolvedValueOnce(
      Response.json({ observation: { id: "note-1" } }),
    );
    expect((await PATCH(request("PATCH", "{}"), context)).status).toBe(200);
    expect(controller.updateObservation).toHaveBeenCalledWith(
      "12345678000199",
      "00000000-0000-4000-8000-000000000001",
      {},
      "request-1",
    );

    controller.updateObservation.mockRejectedValueOnce(
      new ApplicationError("Observação não encontrada.", 404),
    );
    expect((await PATCH(request("PATCH", "{}"), context)).status).toBe(404);
    controller.updateObservation.mockRejectedValueOnce("unexpected");
    const fallback = await PATCH(request("PATCH", "{}"), context);
    expect(fallback.status).toBe(502);
    await expect(fallback.json()).resolves.toMatchObject({
      message: "Não foi possível atualizar a observação.",
    });
  });
});
