import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  updateReason: vi.fn(),
  addObservation: vi.fn(),
  updateObservation: vi.fn(),
}));
vi.mock("@/backend/services/study-list.service", () => ({
  studyListService: service,
}));

import { StudyListController } from "@/backend/controllers/study-list.controller";

describe("StudyListController", () => {
  it("serializes list, add, remove, and observation operations", async () => {
    service.list.mockResolvedValueOnce([{ issuerCnpj: "12345678000199" }]);
    service.add.mockResolvedValueOnce({
      added: true,
      issuerCnpj: "12345678000199",
    });
    service.add.mockResolvedValueOnce({
      added: false,
      issuerCnpj: "12345678000199",
    });
    service.remove.mockResolvedValueOnce({
      removed: true,
      issuerCnpj: "12345678000199",
    });
    service.updateReason.mockResolvedValueOnce({
      issuerCnpj: "12345678000199",
      reason: "Motivo atualizado.",
    });
    service.addObservation.mockResolvedValueOnce({ id: "note-1" });
    service.updateObservation.mockResolvedValueOnce({
      id: "note-1",
      text: "Edited",
    });
    const controller = new StudyListController();

    const list = await controller.list("req-1");
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual({
      entries: [{ issuerCnpj: "12345678000199" }],
      requestId: "req-1",
    });

    expect((await controller.add({}, "req-2")).status).toBe(201);
    expect((await controller.add({}, "req-2")).status).toBe(200);
    expect((await controller.remove("12345678000199", "req-3")).status).toBe(
      200,
    );
    const updatedReason = await controller.updateReason(
      "12345678000199",
      { reason: "Motivo atualizado." },
      "req-3b",
    );
    expect(updatedReason.status).toBe(200);
    await expect(updatedReason.json()).resolves.toMatchObject({
      reason: "Motivo atualizado.",
      requestId: "req-3b",
    });
    expect(
      (await controller.addObservation("12345678000199", {}, "req-4")).status,
    ).toBe(201);
    expect(
      (
        await controller.updateObservation(
          "12345678000199",
          "note-1",
          {},
          "req-5",
        )
      ).status,
    ).toBe(200);
  });
});
