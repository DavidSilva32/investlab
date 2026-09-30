import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { importRepository } from "@/backend/repositories/import.repository";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { inferPortfolioAssetClassification } from "@/backend/services/portfolio-classification";
import { suggestEmergencyReservePositions } from "@/backend/services/emergency-reserve-position-suggestions";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";
import { logger } from "@/infrastructure/logging/logger";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const suggestionSchema = z.object({
  targetAmount: z.number().finite().positive().max(1_000_000_000_000),
});

const settingsSchema = z.object({
  monthlyExpenses: z.number().finite().positive().max(1_000_000_000_000),
  targetMonths: z.number().int().min(1).max(1200),
  selectedAssetKeys: z.array(z.string().regex(/^v1:[a-f0-9]{64}$/)).max(500),
});

type Position = {
  product: string;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  totalValue: string | null;
  referenceDate?: string | null;
  estimatedValue?: number | null;
  classification?: { assetClass: string | null };
};

type ClassifiedPosition = Position & {
  classification: { assetClass: string | null };
};
type ReserveSettings = {
  monthlyExpenses: string | null;
  targetMonths: number | null;
  selectedAssetKeys: string[];
};

function isReserveFixedIncomePosition(position: Position) {
  const inferredClass = inferPortfolioAssetClassification(position).assetClass;
  return (
    position.classification?.assetClass === "Renda fixa" &&
    inferredClass !== "Renda variável" &&
    inferredClass !== "Fundos"
  );
}

function getPositionValue(position: Position) {
  const value =
    position.estimatedValue ??
    (position.totalValue === null ? null : Number(position.totalValue));
  return value !== null && Number.isFinite(value) ? value : null;
}

export class EmergencyReserveService {
  async getEditorData(requestId?: string) {
    logger.info("emergency_reserve_editor_loading", { requestId });
    const [rawPositions, settings, objectives] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      emergencyReserveRepository.getSettings(),
      portfolioObjectivesRepository.list(),
    ]);
    const estimatedPositions = await cdbEstimateService.enrich(rawPositions);
    const normalizedPositions: Position[] = estimatedPositions.map(
      (position): Position => ({
        ...position,
        estimatedValue: position.estimatedValue ?? null,
      }),
    );
    const positions = await portfolioAllocationService.classifyPositions(
      normalizedPositions,
      requestId,
    );
    const objectiveNameById = new Map(
      objectives.objectives.map((objective) => [objective.id, objective.name]),
    );
    const ownerByAssetKey = new Map(
      objectives.assignments.map((assignment) => [
        assignment.assetKey,
        {
          id: assignment.objectiveId,
          name:
            objectiveNameById.get(assignment.objectiveId) ?? "Outro objetivo",
        },
      ]),
    );
    const data = this.buildData(
      positions,
      {
        monthlyExpenses: settings?.monthlyExpenses ?? null,
        targetMonths: settings?.targetMonths ?? null,
        selectedAssetKeys: settings?.selectedAssetKeys ?? [],
      },
      ownerByAssetKey,
    );
    logger.info("emergency_reserve_editor_loaded", {
      requestId,
      holdings: data.holdings.length,
      selectedGroups: data.calculation.selectedGroups,
    });
    return data;
  }

  async getSummary(positions: ClassifiedPosition[], requestId?: string) {
    const settings = await emergencyReserveRepository.getSettings();
    const data = this.buildData(positions, {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
      selectedAssetKeys: settings?.selectedAssetKeys ?? [],
    });
    logger.info("emergency_reserve_summary_loaded", {
      requestId,
      selectedGroups: data.calculation.selectedGroups,
      status: data.calculation.status,
    });
    return {
      ...data.calculation,
      missingSelectionCount: data.missingSelectionCount,
    };
  }

  async getContributionContext(positions: ClassifiedPosition[]) {
    const settings = await emergencyReserveRepository.getSettings();
    const data = this.buildData(positions, {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
      selectedAssetKeys: settings?.selectedAssetKeys ?? [],
    });
    return {
      calculation: {
        ...data.calculation,
        missingSelectionCount: data.missingSelectionCount,
      },
      selectedAssetKeys: data.selectedAssetKeys,
    };
  }

  async suggestPositions(body: unknown, requestId?: string) {
    const parsed = suggestionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um valor maior que zero para comparar as posições.",
        400,
      );
    }

    const rawPositions = await importRepository.listLatestPositions(requestId);
    const estimatedPositions = await cdbEstimateService.enrich(rawPositions);
    const normalizedPositions: Position[] = estimatedPositions.map(
      (position): Position => ({
        ...position,
        estimatedValue: position.estimatedValue ?? null,
      }),
    );
    const positions = await portfolioAllocationService.classifyPositions(
      normalizedPositions,
      requestId,
    );
    const objectives = await portfolioObjectivesRepository.list();
    const objectiveNameById = new Map(
      objectives.objectives.map((objective) => [objective.id, objective.name]),
    );
    const ownerByAssetKey = new Map(
      objectives.assignments.map((assignment) => [
        assignment.assetKey,
        {
          id: assignment.objectiveId,
          name:
            objectiveNameById.get(assignment.objectiveId) ?? "Outro objetivo",
        },
      ]),
    );
    const holdings = this.buildData(
      positions,
      {
        monthlyExpenses: null,
        targetMonths: null,
        selectedAssetKeys: [],
      },
      ownerByAssetKey,
    ).holdings.filter(
      (holding) =>
        holding.assignedObjectiveId === null ||
        holding.assignedObjectiveId === reserveObjectiveId,
    );
    const result = suggestEmergencyReservePositions(
      parsed.data.targetAmount,
      holdings,
    );
    logger.info("emergency_reserve_suggestions_generated", {
      requestId,
      groups: holdings.length,
      status: result.status,
      candidates:
        result.status === "suggestions" ? result.candidates.length : 0,
    });
    return result;
  }

  async saveSettings(body: unknown, requestId?: string) {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success)
      throw new ApplicationError(
        "Informe um custo mensal, uma meta em meses e uma seleção válida de investimentos.",
        400,
      );

    const selectedAssetKeys = [...new Set(parsed.data.selectedAssetKeys)];
    const currentPositions =
      await importRepository.listLatestPositions(requestId);
    const classifiedPositions =
      await portfolioAllocationService.classifyPositions(
        currentPositions,
        requestId,
      );
    const currentAssetClasses = new Map(
      classifiedPositions.map(
        (position) =>
          [
            getEmergencyReserveAssetKey(position),
            isReserveFixedIncomePosition(position) ? "Renda fixa" : null,
          ] as const,
      ),
    );
    const objectives = await portfolioObjectivesRepository.list();
    const ownerByAssetKey = new Map(
      objectives.assignments.map((assignment) => [
        assignment.assetKey,
        assignment.objectiveId,
      ]),
    );
    const conflict = selectedAssetKeys.find(
      (key) =>
        ownerByAssetKey.has(key) &&
        ownerByAssetKey.get(key) !== reserveObjectiveId,
    );
    if (conflict) {
      const objectiveId = ownerByAssetKey.get(conflict);
      const objectiveName = objectives.objectives.find(
        (objective) => objective.id === objectiveId,
      )?.name;
      throw new ApplicationError(
        `Esta posição já está vinculada ao objetivo ${objectiveName ?? "informado"}. Remova-a desse objetivo antes de incluí-la na reserva.`,
        409,
      );
    }
    if (
      selectedAssetKeys.some(
        (key) =>
          currentAssetClasses.has(key) &&
          currentAssetClasses.get(key) !== "Renda fixa",
      )
    ) {
      throw new ApplicationError(
        "A reserva só pode incluir posições classificadas como renda fixa. Revise a seleção antes de salvar.",
        400,
      );
    }
    await emergencyReserveRepository.saveSettings({
      monthlyExpenses: parsed.data.monthlyExpenses.toFixed(2),
      targetMonths: parsed.data.targetMonths,
      selectedAssetKeys,
    });
    logger.info("emergency_reserve_settings_saved", {
      requestId,
      selectedGroups: selectedAssetKeys.length,
    });
    return this.getEditorData(requestId);
  }

  private buildData(
    positions: Position[],
    settings: ReserveSettings,
    ownerByAssetKey: Map<string, { id: string; name: string }> = new Map(),
  ) {
    const groups = new Map<
      string,
      {
        assetKey: string;
        product: string;
        assetCode: string | null;
        institution: string | null;
        issuer: string | null;
        indexer: string | null;
        maturityAt: string | null;
        positionCount: number;
        unvaluedPositions: number;
        value: number;
        hasValue: boolean;
      }
    >();

    const fixedIncomePositions = positions.filter(isReserveFixedIncomePosition);
    for (const position of fixedIncomePositions) {
      const assetKey = getEmergencyReserveAssetKey(position);
      const value = getPositionValue(position);
      const existing = groups.get(assetKey);
      if (existing) {
        existing.positionCount += 1;
        if (value === null) existing.unvaluedPositions += 1;
        else {
          existing.value += value;
          existing.hasValue = true;
        }
        continue;
      }
      groups.set(assetKey, {
        assetKey,
        product: position.product,
        assetCode: position.assetCode,
        institution: position.institution,
        issuer: position.issuer,
        indexer: position.indexer,
        maturityAt: position.maturityAt,
        positionCount: 1,
        unvaluedPositions: value === null ? 1 : 0,
        value: value ?? 0,
        hasValue: value !== null,
      });
    }

    const selected = new Set(settings.selectedAssetKeys);
    const holdings = [...groups.values()]
      .map((group) => ({
        ...group,
        value: group.hasValue ? group.value : null,
        selected: selected.has(group.assetKey),
        assignedObjectiveId: ownerByAssetKey.get(group.assetKey)?.id ?? null,
        assignedObjectiveName:
          ownerByAssetKey.get(group.assetKey)?.name ?? null,
      }))
      .sort((left, right) =>
        left.product.localeCompare(right.product, "pt-BR"),
      );
    const selectedHoldings = holdings.filter((holding) => holding.selected);
    const selectedValue = selectedHoldings.reduce(
      (total, holding) => total + (holding.value ?? 0),
      0,
    );
    const selectedPositionCount = selectedHoldings.reduce(
      (total, holding) => total + holding.positionCount,
      0,
    );
    const unvaluedGroups = selectedHoldings.filter(
      (holding) => holding.unvaluedPositions > 0,
    ).length;
    const referenceDate = fixedIncomePositions[0]?.referenceDate ?? null;
    const monthlyExpenses =
      settings.monthlyExpenses === null
        ? null
        : Number(settings.monthlyExpenses);
    const calculation = calculateEmergencyReserve({
      monthlyExpenses,
      targetMonths: settings.targetMonths,
      selectedValue,
      selectedGroups: selectedHoldings.length,
      unvaluedGroups,
      referenceDate,
    });

    return {
      monthlyExpenses,
      targetMonths: settings.targetMonths,
      selectedAssetKeys: settings.selectedAssetKeys,
      configured: monthlyExpenses !== null && settings.targetMonths !== null,
      holdings,
      missingSelectionCount: [...selected].filter((key) => !groups.has(key))
        .length,
      selectedPositionCount,
      calculation,
    };
  }
}

export const emergencyReserveService = new EmergencyReserveService();
