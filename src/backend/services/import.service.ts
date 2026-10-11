import { createHash } from "node:crypto";
import { z } from "zod";
import { manualPortfolioPositionRepository } from "@/backend/repositories/manual-portfolio-position.repository";
import { getReconciliationCandidates } from "@/backend/services/position-reconciliation";
import {
  importFileSchema,
  positionReferenceDateSchema,
} from "@/backend/schemas/import.schema";
import { parseB3Xlsx } from "@/backend/services/b3-xlsx-parser";
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
]);
const identityFields = [
  ["product", "produto"],
  ["assetCode", "código"],
  ["institution", "instituição"],
  ["issuer", "emissor"],
  ["indexer", "indexador"],
  ["regimeType", "regime"],
  ["issuedAt", "data de emissão"],
  ["maturityAt", "vencimento"],
] as const;
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

export class ImportService {
  preview(file: { name: string; size: number; type: string; buffer: Buffer }) {
    importFileSchema.parse(file);
    return {
      hash: createHash("sha256").update(file.buffer).digest("hex"),
      ...parseB3Xlsx(file.buffer),
    };
  }
  async previewWithIdentityConflicts(
    file: { name: string; size: number; type: string; buffer: Buffer },
    requestId: string,
  ) {
    const preview = this.preview(file);
    if (preview.documentType !== "B3_POSITION_XLSX") return preview;
    return {
      ...preview,
      reconciliationCandidates: getReconciliationCandidates(
        preview.positions,
        await manualPortfolioPositionRepository.list(requestId),
      ),
      identityConflicts: await this.findAssignedPositionsMissingFromImport(
        preview.positions,
        requestId,
      ),
    };
  }
  assertCanBeConfirmed(isDuplicate: boolean) {
    if (isDuplicate)
      throw new ApplicationError(
        "Este arquivo já foi importado anteriormente.",
        409,
      );
  }
  async confirm(
    file: { name: string; size: number; type: string; buffer: Buffer },
    requestId: string,
    referenceDate?: string | null,
    decisions?: unknown,
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
    const preview = this.preview(file);
    if (
      preview.documentType === "B3_MOVEMENT_XLSX" &&
      parsedDecisions.data.length
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
    const reconcileExistingImport =
      duplicate &&
      preview.documentType === "B3_POSITION_XLSX" &&
      parsedDecisions.data.length > 0;
    this.assertCanBeConfirmed(duplicate && !reconcileExistingImport);
    if (preview.documentType === "B3_POSITION_XLSX") {
      const conflicts = await this.findAssignedPositionsMissingFromImport(
        preview.positions,
        requestId,
      );
      if (conflicts.length) {
        const affected = conflicts
          .map(
            ({ objectiveName, position }) =>
              `${position.product} (${objectiveName})`,
          )
          .join(", ");
        throw new ApplicationError(
          `A importação não contém as identidades atuais de posições atribuídas: ${affected}. Investigue as diferenças de identidade antes de confirmar.`,
          409,
        );
      }
    }
    const importData =
      preview.documentType === "B3_MOVEMENT_XLSX"
        ? {
            ...preview,
            movements: preview.movements.map(prepareB3MovementForPersistence),
          }
        : {
            ...this.buildPositionImportData(preview, referenceDate),
            reconciliationDecisions: parsedDecisions.data,
            reconcileExistingImport,
          };
    const result = await importRepository.create(
      { fileName: file.name, fileHash: preview.hash, ...importData },
      requestId,
    );
    return { preview, result, duplicate, referenceDateUpdated: false };
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
        objectiveName: string;
        position: PositionIdentity;
        possibleIncomingDifferences: Array<{
          position: PositionIdentity;
          changedFields: string[];
        }>;
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
      const possibleIncomingDifferences = incoming.flatMap((candidate) => {
        const changedFields = identityFields.flatMap(([field, label]) =>
          normalized(position[field]) === normalized(candidate[field])
            ? []
            : [
                `${label}: ${position[field] ?? "—"} → ${candidate[field] ?? "—"}`,
              ],
        );
        const hasStableAnchor =
          (position.assetCode &&
            normalized(position.assetCode) ===
              normalized(candidate.assetCode)) ||
          normalized(position.product) === normalized(candidate.product);
        return changedFields.length > 0 && hasStableAnchor
          ? [{ position: candidate, changedFields }]
          : [];
      });
      conflicts.set(assetKey, {
        assetKey,
        objectiveName,
        position,
        possibleIncomingDifferences,
      });
    }
    return [...conflicts.values()].sort((left, right) =>
      left.assetKey.localeCompare(right.assetKey),
    );
  }

  async delete(documentType: string | null, requestId: string) {
    if (!documentType || !documentTypes.has(documentType as B3DocumentType)) {
      throw new ApplicationError("Tipo de importação inválido.", 400);
    }
    return importRepository.deleteByDocumentType(
      documentType as B3DocumentType,
      requestId,
    );
  }
}
export const importService = new ImportService();
