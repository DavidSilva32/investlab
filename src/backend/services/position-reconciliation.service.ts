import { z } from "zod";
import { todayInSaoPaulo } from "@/lib/valuation-date";
import {
  activeReconciliationLinks,
  importedReconciliationKey,
  latestReconciliationEventsByPair,
  type ReconciliationEvent,
} from "@/backend/services/position-reconciliation";
import { ApplicationError } from "@/backend/errors/application-error";
import { positionReconciliationRepository } from "@/backend/repositories/position-reconciliation.repository";
import { manualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import { importRepository } from "@/backend/repositories/import.repository";

export class PositionReconciliationService {
  async list(requestId?: string) {
    const [events, positions, importedPositions] = await Promise.all([
      positionReconciliationRepository.listEvents(requestId),
      manualPortfolioPositionRepository.list(requestId),
      importRepository.listLatestPositions(requestId),
    ]);
    const byKey = new Map(
      positions.map((position) => [position.assetKey, position]),
    );
    const typedEvents = events as ReconciliationEvent[];
    const importedByKey = new Map(
      importedPositions.map((position) => [
        importedReconciliationKey(position),
        position,
      ]),
    );
    return {
      separateDecisions: [
        ...latestReconciliationEventsByPair(typedEvents).values(),
      ].filter((event) => event.status === "SEPARATE"),
      links: activeReconciliationLinks(typedEvents, todayInSaoPaulo()).map(
        (event) => ({
          manualAssetKey: event.manualAssetKey,
          importedAssetKey: event.importedAssetKey,
          manualProduct:
            byKey.get(event.manualAssetKey)?.product ??
            "Posição manual arquivada",
          manualInstitution:
            byKey.get(event.manualAssetKey)?.institution ?? null,
          manualValue: byKey.get(event.manualAssetKey)?.totalValue ?? null,
          importedProduct:
            importedByKey.get(event.importedAssetKey)?.product ??
            "Posição B3 arquivada",
          importedInstitution:
            importedByKey.get(event.importedAssetKey)?.institution ?? null,
          importedAssetCode:
            importedByKey.get(event.importedAssetKey)?.assetCode ?? null,
          importedValue:
            importedByKey.get(event.importedAssetKey)?.totalValue ?? null,
          effectiveFrom: event.effectiveFrom,
          recordedAt: event.recordedAt,
        }),
      ),
    };
  }

  async reverse(body: unknown, requestId: string) {
    const parsed = z
      .object({
        manualAssetKey: z.string().regex(/^manual:[0-9a-f-]{36}$/),
        importedAssetKey: z
          .string()
          .regex(/^v1:[a-f0-9]{64}$/)
          .optional(),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new ApplicationError("Selecione uma conciliação válida.", 400);
    const effectiveFrom = todayInSaoPaulo();
    await positionReconciliationRepository.reverse(
      parsed.data.manualAssetKey,
      effectiveFrom,
      requestId,
      parsed.data.importedAssetKey,
    );
    return {
      message: parsed.data.importedAssetKey
        ? "Decisão reaberta. O par poderá ser revisado na próxima prévia B3."
        : "Conciliação desfeita. Os registros originais foram preservados.",
    };
  }
}
export const positionReconciliationService =
  new PositionReconciliationService();
