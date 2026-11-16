import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getSettingsData: vi.fn(),
  saveSettings: vi.fn(),
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: service,
}));

import { EmergencyReserveController } from "@/backend/controllers/emergency-reserve.controller";

describe("EmergencyReserveController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the reserve expense and target settings", async () => {
    const settings = { monthlyExpenses: 4650, targetMonths: 12 };
    service.getSettingsData.mockResolvedValue(settings);

    const response = await new EmergencyReserveController().get("request-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(settings);
    expect(service.getSettingsData).toHaveBeenCalledOnce();
  });

  it("saves settings without exposing position data", async () => {
    service.saveSettings.mockResolvedValue({
      monthlyExpenses: 5000,
      targetMonths: 10,
      selectedAssetKeys: ["legacy:position"],
    });
    const input = { monthlyExpenses: 5000, targetMonths: 10 };

    const response = await new EmergencyReserveController().update(
      input,
      "request-2",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      monthlyExpenses: 5000,
      targetMonths: 10,
      message: "Reserva atualizada com sucesso.",
    });
    expect(service.saveSettings).toHaveBeenCalledWith(input, "request-2");
  });
});
