import { emergencyReserveService } from "@/backend/services/emergency-reserve.service";
import { logger } from "@/infrastructure/logging/logger";

export class EmergencyReserveController {
  async preview(body: unknown, requestId: string) {
    return Response.json(
      await emergencyReserveService.preview(body, requestId),
    );
  }

  async get(requestId: string) {
    logger.info("emergency_reserve_requested", { requestId });
    const data = await emergencyReserveService.getEditorData(requestId);
    logger.info("emergency_reserve_responded", {
      requestId,
      holdings: data.holdings.length,
    });
    return Response.json(data);
  }

  async suggest(body: unknown, requestId: string) {
    logger.info("emergency_reserve_suggestions_requested", { requestId });
    const data = await emergencyReserveService.suggestPositions(
      body,
      requestId,
    );
    logger.info("emergency_reserve_suggestions_responded", {
      requestId,
      status: data.status,
      candidates: data.status === "suggestions" ? data.candidates.length : 0,
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
      ...data,
      message: "Reserva atualizada com sucesso.",
    });
  }

  async updatePositions(body: unknown, requestId: string) {
    logger.info("emergency_reserve_positions_update_requested", { requestId });
    const data = await emergencyReserveService.savePositions(body, requestId);
    logger.info("emergency_reserve_positions_update_responded", {
      requestId,
      selectedGroups: data.calculation.selectedGroups,
    });
    return Response.json({
      ...data,
      message: "Posições da Reserva atualizadas com sucesso.",
    });
  }
}

export const emergencyReserveController = new EmergencyReserveController();
