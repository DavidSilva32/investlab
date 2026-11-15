import { createHash } from "node:crypto";
import { z } from "zod";
import { manualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import {
  getReconciliationCandidates,
  unresolvedReconciliationCandidates,
} from "@/backend/services/position-reconciliation";
import { positionReconciliationRepository } from "@/backend/repositories/position-reconciliation.repository";
import {
  importFileSchema,
  positionReferenceDateSchema,
} from "@/backend/schemas/import.schema";
import { parseB3Xlsx } from "@/backend/services/b3-xlsx-parser";
import { createB3TradeIdentityFingerprint } from "@/backend/services/b3-trading-fingerprint";
import { buildB3ReconciliationSummary } from "@/backend/services/b3-reconciliation-summary";
import { prepareB3MovementForPersistence } from "@/backend/services/b3-movement-fingerprint";
import { createTreasurySelicLiquidityFact } from "@/backend/services/treasury-selic-liquidity";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  importRepository,
  type B3DocumentType,
} from "@/backend/repositories/import.repository";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";

const documentTypes = new Set<B3DocumentType>([
  "B3_POSITION_XLSX",
  "B3_MOVEMENT_XLSX",
  "B3_TRADING_XLSX",
]);
type PositionIdentity = {
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
};
const normalized = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR") ?? "";
const normalizedMovementText = (value: string | null | undefined) =>
  normalized(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export class ImportService {
  async reconciliationSummary(requestId: string) {
    const [trades, movements, events] = await Promise.all([
      importRepository.listTradingItems(requestId),
      importRepository.listMovements(requestId),
      importRepository.listB3ReconciliationEvents(requestId),
    ]);
    return buildB3ReconciliationSummary(trades, movements, events);
  }

  async saveReconciliationDecisions(input: unknown, requestId: string) {
    const schema = z
      .object({
        decisions: z
          .array(
            z
              .object({
                tradeId: z.string().uuid(),
                movementId: z.string().uuid(),
                action: z.enum(["LINK", "KEEP_SEPARATE"]),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict();
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new ApplicationError("Revise as decisões de conciliação.", 400);
    const keys = new Set(
      parsed.data.decisions.map(({ tradeId, movementId }) =>
        JSON.stringify([tradeId, movementId]),
      ),
    );
    if (keys.size !== parsed.data.decisions.length)
      throw new ApplicationError("Há decisões repetidas na conciliação.", 400);
    const links = parsed.data.decisions.filter(
      ({ action }) => action === "LINK",
    );
    if (
      new Set(links.map(({ tradeId }) => tradeId)).size !== links.length ||
      new Set(links.map(({ movementId }) => movementId)).size !== links.length
    )
      throw new ApplicationError(
        "Cada negociação e movimentação pode ter apenas um vínculo.",
        409,
      );
    const summary = await this.reconciliationSummary(requestId);
    const validPairs = new Set([
      ...summary.candidates.map(({ tradeId, movementId }) =>
        JSON.stringify([tradeId, movementId]),
      ),
      ...summary.ambiguous.flatMap(({ tradeId, movementIds }) =>
        movementIds.map((movementId) => JSON.stringify([tradeId, movementId])),
      ),
      ...summary.confirmed.map(({ tradeId, movementId }) =>
        JSON.stringify([tradeId, movementId]),
      ),
    ]);
    if (
      parsed.data.decisions.some(
        ({ tradeId, movementId }) =>
          !validPairs.has(JSON.stringify([tradeId, movementId])),
      )
    )
      throw new ApplicationError(
        "A correspondência não está mais disponível. Atualize a reconciliação.",
        409,
      );
    await importRepository.saveB3ReconciliationDecisions(
      parsed.data.decisions,
      requestId,
    );
    return this.reconciliationSummary(requestId);
  }

  preview(file: { name: string; size: number; type: string; buffer: Buffer }) {
    importFileSchema.parse(file);
    const parsed = parseB3Xlsx(file.buffer);
    return {
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      ...parsed,
      ...(parsed.documentType === "B3_TRADING_XLSX"
        ? {
            history: {
              complete: false,
              reasons: [
                "O arquivo cobre apenas as negociações exportadas e não confirma o histórico completo de operações.",
                "Data de liquidação, taxas e eventos fora deste documento não foram informados.",
              ],
            },
            duplicateCandidates: this.findDuplicateGroups(
              parsed.trades.map((trade) => ({
                ...trade,
                identityFingerprint: createB3TradeIdentityFingerprint(trade),
              })),
            ),
            reconciliation: {
              candidates: [],
              confirmed: [],
              ambiguous: [],
              unmatched: [],
            },
            batchReconciliationPending: true,
          }
        : {}),
    };
  }
  async previewWithIdentityConflicts(
    file: { name: string; size: number; type: string; buffer: Buffer },
    requestId: string,
  ) {
    const preview = this.preview(file);
    if (preview.documentType === "B3_TRADING_XLSX") {
      const existingTrades = await importRepository.listTradingItems(requestId);
      return {
        ...preview,
        duplicateCandidates: this.findDuplicateGroups(
          preview.trades.map((trade) => ({
            ...trade,
            identityFingerprint: createB3TradeIdentityFingerprint(trade),
          })),
          existingTrades,
        ),
      };
    }
    if (preview.documentType !== "B3_POSITION_XLSX") return preview;
    const duplicateImport = await importRepository.existsByHash(
      preview.hash,
      requestId,
    );
    const duplicateReference = duplicateImport
      ? await importRepository.getPositionImportReferenceDateByHash(
          preview.hash,
        )
      : null;
    const [manualPositions, reconciliationEvents] = await Promise.all([
      manualPortfolioPositionRepository.list(requestId),
      positionReconciliationRepository.listEvents(requestId),
    ]);
    const identityReview = await this.findAssignedPositionsMissingFromImport(
      preview.positions,
      requestId,
    );
    return {
      ...preview,
      latestPositionReferenceDate: identityReview.latestPositionReferenceDate,
      reconciliationCandidates: unresolvedReconciliationCandidates(
        getReconciliationCandidates(preview.positions, manualPositions),
        reconciliationEvents,
      ),
      identityConflicts: identityReview.conflicts,
      ...(duplicateImport
        ? {
            duplicateImportMessage:
              "Este arquivo idêntico já foi importado. Ao confirmar, o InvestLab verificará campos ausentes e não criará novas posições.",
            existingReferenceDate: duplicateReference!.referenceDate,
            referenceDateNeedsSelection: duplicateReference!.needsSelection,
            referenceDateConflict: duplicateReference!.conflict,
          }
        : {}),
    };
  }
  assertCanBeConfirmed(isDuplicate: boolean) {
    if (isDuplicate)
      throw new ApplicationError(
        "Este arquivo já foi importado anteriormente.",
        409,
      );
  }

  private findDuplicateGroups(
    trades: Array<{ identityFingerprint: string; sourceRow: number }>,
    existingTrades: Array<{
      identityFingerprint: string;
      sourceRow: number;
      id?: string;
    }> = [],
  ) {
    const groups = new Map<
      string,
      { incomingRows: number[]; existingIds: string[]; count: number }
    >();
    trades.forEach((trade) => {
      const group = groups.get(trade.identityFingerprint) ?? {
        incomingRows: [],
        existingIds: [],
        count: 0,
      };
      group.incomingRows.push(trade.sourceRow);
      group.count += 1;
      groups.set(trade.identityFingerprint, group);
    });
    for (const existing of existingTrades) {
      const group = groups.get(existing.identityFingerprint);
      if (!group) continue;
      if (existing.id) group.existingIds.push(existing.id);
      group.count += 1;
    }
    return [...groups.entries()]
      .filter(([, group]) => group.count > 1)
      .map(([identityFingerprint, group]) => ({
        identityFingerprint,
        sourceRows: group.incomingRows,
        existingCount: group.existingIds.length,
        occurrenceCount: group.count,
        status: "ambiguous" as const,
      }));
  }
  async confirm(
    file: { name: string; size: number; type: string; buffer: Buffer },
    requestId: string,
    referenceDate?: string | null,
    decisions?: unknown,
    retiredObjectiveAssignments?: unknown,
  ) {
    const decisionSchema = z
      .array(
        z
          .object({
            manualAssetKey: z.string().regex(/^manual:[0-9a-f-]{36}$/),
            importedAssetKey: z.string().regex(/^v1:[a-f0-9]{64}$/),
            action: z.enum(["link", "separate"]),
            manualUpdatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .max(1000);
    const parsedDecisions = decisionSchema.safeParse(decisions ?? []);
    if (!parsedDecisions.success)
      throw new ApplicationError("Revise as decisões de conciliação.", 400);
    const retiredAssignmentsSchema = z
      .array(
        z
          .object({
            assetKey: z.string().regex(/^v1:[a-f0-9]{64}$/),
            objectiveId: z.string().uuid(),
          })
          .strict(),
      )
      .max(1000)
      .refine(
        (assignments) =>
          new Set(
            assignments.map(({ assetKey, objectiveId }) =>
              JSON.stringify([assetKey, objectiveId]),
            ),
          ).size === assignments.length,
      );
    const parsedRetiredAssignments = retiredAssignmentsSchema.safeParse(
      retiredObjectiveAssignments ?? [],
    );
    if (!parsedRetiredAssignments.success)
      throw new ApplicationError(
        "Confirmações de posições removidas inválidas.",
        400,
      );
    const preview = this.preview(file);
    if (
      preview.documentType !== "B3_POSITION_XLSX" &&
      (parsedDecisions.data.length || parsedRetiredAssignments.data.length)
    ) {
      throw new ApplicationError(
        "Conciliação disponível apenas para posições.",
        400,
      );
    }
    const duplicate = await importRepository.existsByHash(
      preview.hash,
      requestId,
    );
    const reprocessExistingImport =
      duplicate && preview.documentType === "B3_POSITION_XLSX";
    if (reprocessExistingImport && parsedRetiredAssignments.data.length)
      throw new ApplicationError(
        "A revisão de arquivo já importado não pode remover vínculos de posições. Envie um novo snapshot da B3.",
        409,
      );
    const existingReference = reprocessExistingImport
      ? await importRepository.getPositionImportReferenceDateByHash(
          preview.hash,
        )
      : null;
    if (reprocessExistingImport && existingReference?.conflict)
      throw new ApplicationError(
        "As datas do arquivo e do snapshot não são coerentes. A importação não será alterada.",
        409,
      );
    if (
      reprocessExistingImport &&
      existingReference?.needsSelection &&
      !referenceDate
    )
      throw new ApplicationError(
        "Selecione a data exibida pela B3 para preencher a data ausente deste snapshot legado.",
        400,
      );
    const existingReferenceDate = existingReference?.referenceDate ?? null;
    if (
      reprocessExistingImport &&
      referenceDate &&
      existingReferenceDate &&
      referenceDate !== existingReferenceDate
    )
      throw new ApplicationError(
        "A data deve ser a mesma do arquivo já importado. O snapshot existente não será alterado.",
        409,
      );
    const effectiveReferenceDate =
      reprocessExistingImport && !referenceDate
        ? existingReferenceDate
        : referenceDate;
    const reconcileExistingImport =
      reprocessExistingImport && parsedDecisions.data.length > 0;
    this.assertCanBeConfirmed(duplicate && !reprocessExistingImport);
    let retiredAssignmentsForImport = parsedRetiredAssignments.data;
    if (
      preview.documentType === "B3_POSITION_XLSX" &&
      !reprocessExistingImport
    ) {
      const { conflicts } = await this.findAssignedPositionsMissingFromImport(
        preview.positions,
        requestId,
      );
      retiredAssignmentsForImport = conflicts.map(
        ({ assetKey, objectiveId }) => ({ assetKey, objectiveId }),
      );
    }
    const importData =
      preview.documentType === "B3_MOVEMENT_XLSX"
        ? {
            ...preview,
            movements: preview.movements.map(prepareB3MovementForPersistence),
          }
        : preview.documentType === "B3_TRADING_XLSX"
          ? {
              ...preview,
              trades: preview.trades.map((trade) => ({
                ...trade,
                identityFingerprint: createB3TradeIdentityFingerprint(trade),
              })),
            }
          : {
              ...this.buildPositionImportData(preview, effectiveReferenceDate),
              reconciliationDecisions: parsedDecisions.data,
              retiredObjectiveAssignments: retiredAssignmentsForImport,
              reconcileExistingImport,
              reprocessExistingImport,
            };
    const result = await importRepository.create(
      { fileName: file.name, fileHash: preview.hash, ...importData },
      requestId,
    );
    return {
      preview,
      result,
      duplicate,
      referenceDateUpdated:
        reprocessExistingImport &&
        "referenceDateUpdated" in result &&
        result.referenceDateUpdated,
      reprocessedExistingImport: reprocessExistingImport,
    };
  }

  private buildPositionImportData(
    preview: Extract<
      ReturnType<typeof parseB3Xlsx>,
      { documentType: "B3_POSITION_XLSX" }
    >,
    referenceDate: string | null | undefined,
  ) {
    const parsedReferenceDate =
      positionReferenceDateSchema.parse(referenceDate);
    return {
      ...preview,
      referenceDate: parsedReferenceDate,
      estimationBaseDate: parsedReferenceDate,
      liquidityFacts: preview.positions.map((position) =>
        createTreasurySelicLiquidityFact({
          ...position,
          referenceDate: parsedReferenceDate,
        }),
      ),
    };
  }

  private async findAssignedPositionsMissingFromImport(
    incoming: PositionIdentity[],
    requestId: string,
  ) {
    const [currentPositions, objectives] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      portfolioObjectivesRepository.list(),
    ]);
    const incomingByKey = new Map(
      incoming.map((position) => [
        getEmergencyReserveAssetKey(position),
        position,
      ]),
    );
    const objectiveById = new Map(
      objectives.objectives.map((objective) => [objective.id, objective.name]),
    );
    const objectiveByAssetKey = new Map(
      objectives.assignments.map((assignment) => [
        assignment.assetKey,
        assignment.objectiveId,
      ]),
    );
    const conflicts = new Map<
      string,
      {
        assetKey: string;
        objectiveId: string;
        objectiveName: string;
        position: PositionIdentity;
      }
    >();
    for (const position of currentPositions as PositionIdentity[]) {
      const assetKey = getEmergencyReserveAssetKey(position);
      const objectiveId = objectiveByAssetKey.get(assetKey);
      const objectiveName = objectiveId ? objectiveById.get(objectiveId) : null;
      if (
        !objectiveName ||
        incomingByKey.has(assetKey) ||
        conflicts.has(assetKey)
      )
        continue;
      conflicts.set(assetKey, {
        assetKey,
        objectiveId: objectiveId!,
        objectiveName,
        position,
      });
    }
    const missingPositions = [...conflicts.values()].sort((left, right) =>
      left.assetKey.localeCompare(right.assetKey),
    );
    const latestPositionReferenceDate =
      (
        currentPositions[0] as
          (PositionIdentity & { referenceDate?: string | null }) | undefined
      )?.referenceDate ?? null;
    if (!missingPositions.length)
      return { conflicts: [], latestPositionReferenceDate };
    const movements = await importRepository.listMovements(requestId);
    const conflictsWithRedemptions = missingPositions.map((conflict) => {
      const assetCode = conflict.position.assetCode;
      const matchingRedemptions = assetCode
        ? movements
            .filter(
              (candidate) =>
                Boolean(latestPositionReferenceDate) &&
                candidate.occurredAt > latestPositionReferenceDate! &&
                normalized(candidate.assetCode) === normalized(assetCode) &&
                (!candidate.institution ||
                  !conflict.position.institution ||
                  normalized(candidate.institution) ===
                    normalized(conflict.position.institution)) &&
                candidate.direction === "DEBITO" &&
                normalizedMovementText(candidate.movementType).includes(
                  "RESGATE",
                ),
            )
            .map((movement) => ({
              occurredAt: movement.occurredAt,
              movementType: movement.movementType,
              quantity: movement.quantity,
              operationValue: movement.operationValue,
            }))
        : [];
      return {
        ...conflict,
        matchingRedemptions,
      };
    });
    return { conflicts: conflictsWithRedemptions, latestPositionReferenceDate };
  }

  async delete(
    documentType: string | null,
    requestId: string,
    itemId: string | null = null,
  ) {
    if (!documentType || !documentTypes.has(documentType as B3DocumentType)) {
      throw new ApplicationError("Tipo de importação inválido.", 400);
    }
    if (itemId !== null) {
      if (!z.string().uuid().safeParse(itemId).success)
        throw new ApplicationError("Identificador de registro inválido.", 400);
      if (documentType === "B3_POSITION_XLSX") {
        await importRepository.deleteLatestPosition(itemId, requestId);
        return { message: "Posição removida do fechamento atual." };
      }
      await importRepository.deleteUnreconciledMovement(itemId, requestId);
      return { message: "Movimentação excluída." };
    }
    return importRepository.deleteByDocumentType(
      documentType as B3DocumentType,
      requestId,
    );
  }
}
export const importService = new ImportService();
