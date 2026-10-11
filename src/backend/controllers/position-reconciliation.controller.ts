import { ApplicationError } from "@/backend/errors/application-error";
import { positionReconciliationService } from "@/backend/services/position-reconciliation.service";

export class PositionReconciliationController {
  async list(requestId: string) {
    return Response.json(await positionReconciliationService.list(requestId));
  }
  async reverse(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApplicationError("Dados de conciliação inválidos.", 400);
    }
    return Response.json(
      await positionReconciliationService.reverse(body, requestId),
    );
  }
}
export const positionReconciliationController =
  new PositionReconciliationController();
