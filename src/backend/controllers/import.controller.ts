import { ApplicationError } from "@/backend/errors/application-error";

import { importService } from "@/backend/services/import.service";
import { logger } from "@/infrastructure/logging/logger";

export class ImportController {
  async reconciliationSummary(requestId: string) {
    return Response.json(await importService.reconciliationSummary(requestId));
  }

  async saveReconciliationDecisions(request: Request, requestId: string) {
    let decisions: unknown;
    try {
      decisions = await request.json();
    } catch {
      throw new ApplicationError("Decisões de conciliação inválidas.", 400);
    }
    const summary = await importService.saveReconciliationDecisions(
      decisions,
      requestId,
    );
    return Response.json({ ...summary, message: "Reconciliação atualizada." });
  }

  private async readFile(request: Request) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      throw new ApplicationError("Selecione um arquivo para importar.", 400);
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      referenceDate: formData.get("referenceDate"),
      reconciliationDecisions: formData.get("reconciliationDecisions"),
      retiredObjectiveAssignments: formData.get("retiredObjectiveAssignments"),
    };
  }

  async preview(request: Request, requestId: string) {
    logger.info("b3_import_preview_started", { requestId });
    const {
      referenceDate: _referenceDate,
      reconciliationDecisions: _decisions,
      retiredObjectiveAssignments: _retiredObjectiveAssignments,
      ...file
    } = await this.readFile(request);
    const preview = await importService.previewWithIdentityConflicts(
      file,
      requestId,
    );
    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.documentType === "B3_MOVEMENT_XLSX"
          ? preview.movements.length
          : preview.trades.length;
    logger.info("b3_import_format_recognized", {
      requestId,
      documentType: preview.documentType,
    });
    logger.info("b3_import_records_parsed", { requestId, records: count });
    return Response.json({ ...preview, count });
  }

  async confirm(request: Request, requestId: string) {
    logger.info("b3_import_confirm_started", { requestId });
    const {
      referenceDate,
      reconciliationDecisions,
      retiredObjectiveAssignments,
      ...file
    } = await this.readFile(request);
    let decisions: unknown;
    if (reconciliationDecisions !== null) {
      if (typeof reconciliationDecisions !== "string")
        throw new ApplicationError("Decisões de conciliação inválidas.", 400);
      try {
        decisions = JSON.parse(reconciliationDecisions);
      } catch {
        throw new ApplicationError("Decisões de conciliação inválidas.", 400);
      }
    }
    let retiredAssignments: unknown;
    if (retiredObjectiveAssignments !== null) {
      if (typeof retiredObjectiveAssignments !== "string")
        throw new ApplicationError(
          "Confirmações de posições removidas inválidas.",
          400,
        );
      try {
        retiredAssignments = JSON.parse(retiredObjectiveAssignments);
      } catch {
        throw new ApplicationError(
          "Confirmações de posições removidas inválidas.",
          400,
        );
      }
    }
    const {
      preview,
      result,
      duplicate,
      referenceDateUpdated = false,
      reprocessedExistingImport = false,
      retirementReview = [],
    } = await importService.confirm(
      file,
      requestId,
      typeof referenceDate === "string" ? referenceDate : null,
      decisions,
      retiredAssignments,
    );
    if (duplicate)
      logger.warn("b3_import_duplicate_detected", {
        requestId,
        fileHashPrefix: preview.hash.slice(0, 12),
      });

    const count =
      preview.documentType === "B3_POSITION_XLSX"
        ? preview.positions.length
        : preview.documentType === "B3_MOVEMENT_XLSX"
          ? preview.movements.length
          : preview.trades.length;
    const enrichedPositionCount =
      "enrichedPositionCount" in result ? result.enrichedPositionCount : 0;
    const importMessage = referenceDateUpdated
      ? reprocessedExistingImport
        ? enrichedPositionCount
          ? `Data exibida na B3 registrada e ${enrichedPositionCount} posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.`
          : "Data exibida na B3 registrada no snapshot legado. Nenhuma posição precisou de enriquecimento."
        : "Data exibida na B3 atualizada para as posições já importadas."
      : reprocessedExistingImport
        ? enrichedPositionCount
          ? `${enrichedPositionCount} posição(ões) existente(s) enriquecida(s). Nenhuma nova posição foi criada.`
          : "Arquivo idêntico revisado. Não havia campos ausentes para enriquecer e nenhuma nova posição foi criada."
        : preview.documentType === "B3_POSITION_XLSX"
          ? `${count} posição(ões) importada(s) com sucesso.`
          : preview.documentType === "B3_MOVEMENT_XLSX"
            ? `${count} movimentação(ões) importada(s) com sucesso.`
            : `${count} negociação(ões) importada(s) com sucesso.`;
    const retiredCount = retirementReview.filter(
      ({ reason }) => reason === "total_redemption",
    ).length;
    const preservedReasonLabels: Record<string, [string, string]> = {
      partial_redemption: ["resgate parcial", "resgates parciais"],
      duplicate_evidence: [
        "movimentação duplicada",
        "movimentações duplicadas",
      ],
      institution_mismatch: [
        "divergência de instituição",
        "divergências de instituição",
      ],
      identity_conflict: ["conflito de identidade", "conflitos de identidade"],
      snapshot_not_newer: ["snapshot fora de ordem", "snapshots fora de ordem"],
      snapshot_date_unavailable: [
        "data de snapshot indisponível",
        "datas de snapshot indisponíveis",
      ],
      movement_before_previous_snapshot: [
        "movimentação anterior ao snapshot",
        "movimentações anteriores ao snapshot",
      ],
      no_matching_redemption: [
        "resgate compatível não encontrado",
        "resgates compatíveis não encontrados",
      ],
      incomplete_evidence: ["evidência incompleta", "evidências incompletas"],
    };
    const preservedReasons = new Map<
      string,
      { count: number; labels: [string, string] }
    >();
    for (const { reason } of retirementReview) {
      if (reason === "total_redemption") continue;
      const labels = preservedReasonLabels[reason] ?? [
        "evidência incompleta",
        "evidências incompletas",
      ];
      const current = preservedReasons.get(reason);
      preservedReasons.set(reason, {
        count: (current?.count ?? 0) + 1,
        labels,
      });
    }
    const retirementMessage = [
      retiredCount
        ? `${retiredCount} ${retiredCount === 1 ? "vínculo encerrado" : "vínculos encerrados"} após resgate total.`
        : "",
      preservedReasons.size
        ? `${[...preservedReasons.entries()]
            .map(([, { count, labels }]) =>
              count === 1 ? `1 ${labels[0]}` : `${count} ${labels[1]}`,
            )
            .join(", ")} — os vínculos foram mantidos.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return Response.json(
      {
        importId: result.importId,
        count,
        ...(reprocessedExistingImport ? { enrichedPositionCount } : {}),
        documentType: preview.documentType,
        message: [importMessage, retirementMessage].filter(Boolean).join(" "),
      },
      { status: reprocessedExistingImport ? 200 : 201 },
    );
  }

  async delete(
    documentType: string | null,
    requestId: string,
    itemId: string | null = null,
  ) {
    const result = await importService.delete(documentType, requestId, itemId);
    if (typeof result === "number") {
      logger.info("b3_imports_deleted", {
        requestId,
        documentType,
        deletedImports: result,
      });
      return Response.json({ deletedImports: result });
    }
    logger.info("b3_import_item_deleted", { requestId, documentType, itemId });
    return Response.json(result);
  }
}
export const importController = new ImportController();
