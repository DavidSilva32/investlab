import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { logger } from "@/infrastructure/logging/logger";

export class EmergencyReserveController {
  async get(requestId: string) {
    logger.info("emergency_reserve_requested", { requestId });
    const data = await emergencyReserveService.getEditorData(requestId);
    logger.info("emergency_reserve_responded", {
      requestId,
      holdings: data.holdings.length,
    });
    return Response.json(data);
  }

  async update(body: unknown, requestId: string) {
    logger.info("emergency_reserve_update_requested", { requestId });
    const data = await emergencyReserveService.saveSettings(body, requestId);
    logger.info("emergency_reserve_update_responded", {
      requestId,
      selectedGroups: data.calculation.selectedGroups,
    });
    return Response.json({
      ...data,
      message: "Reserva atualizada com sucesso.",
    });
  }
}

export const emergencyReserveController = new EmergencyReserveController();
