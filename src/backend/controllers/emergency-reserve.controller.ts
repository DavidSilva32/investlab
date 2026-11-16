import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { logger } from "@/infrastructure/logging/logger";

export class EmergencyReserveController {
  async get(requestId: string) {
    logger.info("emergency_reserve_requested", { requestId });
    const data = await emergencyReserveService.getSettingsData();
    logger.info("emergency_reserve_responded", {
      requestId,
    });
    return Response.json(data);
  }

  async update(body: unknown, requestId: string) {
    logger.info("emergency_reserve_update_requested", { requestId });
    const data = await emergencyReserveService.saveSettings(body, requestId);
    logger.info("emergency_reserve_update_responded", {
      requestId,
    });
    return Response.json({
      monthlyExpenses: data.monthlyExpenses,
      targetMonths: data.targetMonths,
      message: "Reserva atualizada com sucesso.",
    });
  }
}

export const emergencyReserveController = new EmergencyReserveController();
