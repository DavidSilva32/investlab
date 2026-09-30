import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  updateAssignments: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/backend/controllers/portfolio-objectives.controller", () => ({
  portfolioObjectivesController: controller,
}));

import { ApplicationError } from "@/backend/errors/application-error";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "@/app/api/portfolio/objectives/route";

describe("portfolio objectives route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns GET controller data", async () => {
    controller.get.mockResolvedValue(Response.json({ objectives: [] }));
    const response = await GET(
      new Request("http://localhost/api/portfolio/objectives"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ objectives: [] });
  });

  it("returns a client-safe GET failure", async () => {
    controller.get.mockRejectedValue(new Error("secret database detail"));
    const response = await GET(
      new Request("http://localhost/api/portfolio/objectives"),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível carregar os objetivos.",
    });
  });

  it("returns POST success and expected validation errors", async () => {
    controller.create.mockResolvedValue(
      Response.json({ id: "goal-1" }, { status: 201 }),
    );
    const request = new Request("http://localhost/api/portfolio/objectives", {
      method: "POST",
      body: JSON.stringify({ name: "Viagem" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(request)).status).toBe(201);

    controller.create.mockRejectedValue(
      new ApplicationError("Nome inválido.", 400),
    );
    const invalidRequest = new Request(
      "http://localhost/api/portfolio/objectives",
      {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      },
    );
    const invalidResponse = await POST(invalidRequest);
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      message: "Nome inválido.",
    });
  });

  it("returns PATCH success and safe unexpected failures", async () => {
    controller.updateAssignments.mockResolvedValue(
      Response.json({ message: "saved" }),
    );
    const request = () =>
      new Request("http://localhost/api/portfolio/objectives", {
        method: "PATCH",
        body: JSON.stringify({ objectiveId: "goal-1", assetKeys: [] }),
        headers: { "content-type": "application/json" },
      });
    expect((await PATCH(request())).status).toBe(200);

    controller.updateAssignments.mockRejectedValue(new Error("sensitive"));
    const response = await PATCH(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Não foi possível salvar os objetivos.",
    });
  });

  it("routes PUT updates and DELETE objective requests", async () => {
    controller.update.mockResolvedValue(Response.json({ id: "goal-1" }));
    const updateResponse = await PUT(
      new Request("http://localhost/api/portfolio/objectives", {
        method: "PUT",
        body: JSON.stringify({ objectiveId: "goal-1", name: "Carro" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(updateResponse.status).toBe(200);

    controller.delete.mockResolvedValue(Response.json({ message: "deleted" }));
    const deleteResponse = await DELETE(
      new Request(
        "http://localhost/api/portfolio/objectives?objectiveId=goal-1",
        { method: "DELETE" },
      ),
    );
    expect(deleteResponse.status).toBe(200);
    expect(controller.delete).toHaveBeenCalledWith(
      "goal-1",
      expect.any(String),
    );
  });

  it("returns client-safe failures for PUT and DELETE", async () => {
    controller.update.mockRejectedValue(new Error("private update detail"));
    const updateResponse = await PUT(
      new Request("http://localhost/api/portfolio/objectives", {
        method: "PUT",
        body: JSON.stringify({ objectiveId: "goal-1", name: "Carro" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(updateResponse.status).toBe(500);
    await expect(updateResponse.json()).resolves.toEqual({
      message: "Não foi possível salvar os objetivos.",
    });

    controller.delete.mockRejectedValue(new Error("private delete detail"));
    const deleteResponse = await DELETE(
      new Request(
        "http://localhost/api/portfolio/objectives?objectiveId=goal-1",
        { method: "DELETE" },
      ),
    );
    expect(deleteResponse.status).toBe(500);
    await expect(deleteResponse.json()).resolves.toEqual({
      message: "Não foi possível salvar os objetivos.",
    });
  });

  it("passes an empty objective id when DELETE omits the query parameter", async () => {
    controller.delete.mockResolvedValue(Response.json({ message: "deleted" }));
    const response = await DELETE(
      new Request("http://localhost/api/portfolio/objectives", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(controller.delete).toHaveBeenCalledWith("", expect.any(String));
  });
});
