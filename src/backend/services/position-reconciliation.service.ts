import { z } from "zod";
import { todayInSaoPaulo } from "@/lib/valuation-date";
import {
  activeReconciliationLinks,
  type ReconciliationEvent,
} from "@/backend/services/position-reconciliation";
import { ApplicationError } from "@/backend/errors/application-error";
import { positionReconciliationRepository } from "@/backend/repositories/position-reconciliation.repository";
import { manualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";

export class PositionReconciliationService {
  async list(requestId?: string) {
    const [events, positions] = await Promise.all([
      positionReconciliationRepository.listEvents(requestId),
      manualPortfolioPositionRepository.list(requestId),
    ]);
    const byKey = new Map(
      positions.map((position) => [position.assetKey, position]),
    );
    return {
      links: activeReconciliationLinks(
        events as ReconciliationEvent[],
        todayInSaoPaulo(),
      ).map((event) => ({
        manualAssetKey: event.manualAssetKey,
        importedAssetKey: event.importedAssetKey,
        manualProduct:
          byKey.get(event.manualAssetKey)?.product ??
          "Posição manual arquivada",
        effectiveFrom: event.effectiveFrom,
        recordedAt: event.recordedAt,
      })),
    };
  }

  async reverse(body: unknown, requestId: string) {
    const parsed = z
      .object({ manualAssetKey: z.string().regex(/^manual:[0-9a-f-]{36}$/) })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Selecione uma conciliação válida.", 400);
    const effectiveFrom = todayInSaoPaulo();
    await positionReconciliationRepository.reverse(
      parsed.data.manualAssetKey,
      effectiveFrom,
      requestId,
    );
    return {
      message:
        "Conciliação desfeita. Os registros originais foram preservados.",
    };
  }
}
export const positionReconciliationService =
  new PositionReconciliationService();
