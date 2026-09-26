import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getEditorData: vi.fn(),
  saveSettings: vi.fn(),
  suggestPositions: vi.fn(),
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: service,
}));

import { EmergencyReserveController } from "@/backend/controllers/emergency-reserve.controller";

describe("EmergencyReserveController", () => {
  it("returns editor data and saves the supplied settings through the service", async () => {
    const editorData = { holdings: [], selectedAssetKeys: [] };
    service.getEditorData.mockResolvedValue(editorData);
    service.suggestPositions.mockResolvedValue({
      status: "suggestions",
      kind: "exact",
      candidates: [],
      searchLimited: false,
    });
    service.saveSettings.mockResolvedValue({
      ...editorData,
      configured: true,
      calculation: { selectedGroups: 1 },
    });
    const controller = new EmergencyReserveController();

    await expect((await controller.get("request-1")).json()).resolves.toEqual(
      editorData,
    );
    const body = { monthlyExpenses: 1200, targetMonths: 6 };
    await expect(
      (await controller.update(body, "request-2")).json(),
    ).resolves.toEqual({
      ...editorData,
      configured: true,
      calculation: { selectedGroups: 1 },
      message: "Reserva atualizada com sucesso.",
    });
    expect(service.getEditorData).toHaveBeenCalledWith("request-1");
    expect(service.saveSettings).toHaveBeenCalledWith(body, "request-2");
    await expect(
      (await controller.suggest({ targetAmount: 100 }, "request-3")).json(),
    ).resolves.toMatchObject({ status: "suggestions" });
    expect(service.suggestPositions).toHaveBeenCalledWith(
      { targetAmount: 100 },
      "request-3",
    );
  });

  it("returns an unmodified non-suggestions status from the service", async () => {
    const controller = new EmergencyReserveController();
    const responseBody = { status: "too_many_positions", maximum: 40 };
    service.suggestPositions.mockResolvedValue(responseBody);

    const response = await controller.suggest(
      { targetAmount: 100 },
      "request-4",
    );

    await expect(response.json()).resolves.toEqual(responseBody);
    expect(service.suggestPositions).toHaveBeenCalledWith(
      { targetAmount: 100 },
      "request-4",
    );
  });
});
