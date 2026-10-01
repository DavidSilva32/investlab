import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { importRepository } from "@/backend/repositories/import.repository";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { inferPortfolioAssetClassification } from "@/backend/services/portfolio-classification";
import {
  suggestEmergencyReservePositions,
  type ReservePositionSuggestion,
} from "@/backend/services/emergency-reserve-position-suggestions";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";
import { logger } from "@/infrastructure/logging/logger";
import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import {
  centsToNumber,
  resolvePositionMoney,
  sumMoneyCents,
  type PortfolioMoneySource,
} from "@/lib/portfolio-money";
import { withCanonicalPortfolioValue } from "@/backend/services/portfolio-position.service";

const suggestionSchema = z.object({
  targetAmount: z.number().finite().positive().max(1_000_000_000_000),
  reserveTargetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_200_000_000_000_000)
    .nullable()
    .optional(),
});

const settingsSchema = z.object({
  monthlyExpenses: z.number().finite().positive().max(1_000_000_000_000),
  targetMonths: z.number().int().min(1).max(1200),
  selectedAssetKeys: z.array(z.string().regex(/^v1:[a-f0-9]{64}$/)).max(500),
  transfers: z
    .array(
      z.object({
        assetKey: z.string().regex(/^v1:[a-f0-9]{64}$/),
        fromObjectiveId: z.string().uuid(),
        toObjectiveId: z.string().uuid(),
      }),
    )
    .max(500)
    .default([]),
});
const previewSchema = z.object({
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
  estimatedValueCents?: string | null;
  canonicalValueCents?: string | null;
  canonicalValueSource?: PortfolioMoneySource;
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
type ReserveImpactObjective = {
  id: string;
  name: string;
  currentValue: number | null;
  knownValue: number;
  targetAmount: number | null;
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
  if (position.canonicalValueCents !== undefined) {
    return position.canonicalValueCents === null
      ? null
      : BigInt(position.canonicalValueCents);
  }
  return resolvePositionMoney(position).cents;
}

export class EmergencyReserveService {
  async preview(body: unknown, requestId?: string) {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Revise os valores da configuração da reserva.",
        400,
      );
    }
    const data = await this.getEditorData(requestId);
    const selected = new Set(parsed.data.selectedAssetKeys);
    const holdings = data.holdings.filter((holding) =>
      selected.has(holding.assetKey),
    );
    const selectedValueCents = sumMoneyCents(
      holdings.map((holding) =>
        holding.valueCents === null ? null : BigInt(holding.valueCents),
      ),
    );
    return calculateEmergencyReserve({
      monthlyExpenses: parsed.data.monthlyExpenses,
      targetMonths: parsed.data.targetMonths,
      selectedValue: centsToNumber(selectedValueCents)!,
      selectedValueCents: selectedValueCents.toString(),
      selectedGroups: holdings.length,
      unvaluedGroups: holdings.filter((holding) => holding.valueCents === null)
        .length,
      referenceDate: data.calculation.referenceDate,
    });
  }

  async getEditorData(requestId?: string) {
    logger.info("emergency_reserve_editor_loading", { requestId });
    const [rawPositions, settings, objectives] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      emergencyReserveRepository.getSettings(),
      portfolioObjectivesRepository.list(),
    ]);
    const estimatedPositions = await cdbEstimateService.enrich(rawPositions);
    const normalizedPositions: Position[] = estimatedPositions.map(
      (position): Position =>
        withCanonicalPortfolioValue({
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
      (position): Position =>
        withCanonicalPortfolioValue({
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
    ).holdings;
    const withoutTransfers = holdings.filter(
      (holding) =>
        holding.assignedObjectiveId === null ||
        holding.assignedObjectiveId === reserveObjectiveId,
    );
    const baseline = suggestEmergencyReservePositions(
      parsed.data.targetAmount,
      withoutTransfers,
    );
    let result = baseline;
    if (
      !(baseline.status === "suggestions" && baseline.kind === "exact") &&
      !(baseline.status === "suggestions" && baseline.searchLimited)
    ) {
      const expanded = suggestEmergencyReservePositions(
        parsed.data.targetAmount,
        holdings,
      );
      if (expanded.status === "suggestions") {
        const baselineDifference =
          baseline.status === "suggestions"
            ? Math.min(
                ...baseline.candidates.map((candidate) =>
                  Math.abs(candidate.difference),
                ),
              )
            : Number.POSITIVE_INFINITY;
        const better = expanded.candidates.filter(
          (candidate) =>
            candidate.difference === 0 ||
            Math.abs(candidate.difference) < baselineDifference,
        );
        if (better.length > 0) {
          const [overview, reserveSettings] = await Promise.all([
            portfolioObjectivesService.getOverview(requestId),
            parsed.data.reserveTargetAmount === undefined
              ? emergencyReserveRepository.getSettings()
              : Promise.resolve(null),
          ]);
          const reserveTarget =
            parsed.data.reserveTargetAmount !== undefined
              ? parsed.data.reserveTargetAmount
              : reserveSettings?.monthlyExpenses && reserveSettings.targetMonths
                ? Number(reserveSettings.monthlyExpenses) *
                  reserveSettings.targetMonths
                : null;
          const objectiveById = new Map(
            overview.objectives.map((objective) => [objective.id, objective]),
          );
          const valueByAsset = new Map(
            overview.positions.map((position) => [
              position.assetKey,
              position.value,
            ]),
          );
          const holdingByAsset = new Map(
            holdings.map((holding) => [holding.assetKey, holding]),
          );
          result = {
            ...expanded,
            kind: better.some((candidate) => candidate.difference === 0)
              ? "exact"
              : "nearest",
            candidates: better.map((candidate) =>
              this.addTransferDetails(
                candidate,
                holdingByAsset,
                valueByAsset,
                objectiveById,
                reserveTarget,
              ),
            ),
          };
        }
      }
    }
    logger.info("emergency_reserve_suggestions_generated", {
      requestId,
      groups: withoutTransfers.length,
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
    const transfers = parsed.data.transfers;
    const transfersByKey = new Map(
      transfers.map((transfer) => [transfer.assetKey, transfer]),
    );
    if (
      transfersByKey.size !== transfers.length ||
      transfers.some(
        (transfer) =>
          !selectedAssetKeys.includes(transfer.assetKey) ||
          transfer.toObjectiveId !== reserveObjectiveId,
      )
    ) {
      throw new ApplicationError("Revise as transferências selecionadas.", 400);
    }
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
    const conflict = selectedAssetKeys.find((key) => {
      const owner = ownerByAssetKey.get(key);
      const transfer = transfersByKey.get(key);
      return (
        owner !== undefined &&
        owner !== reserveObjectiveId &&
        transfer?.fromObjectiveId !== owner
      );
    });
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
    const invalidTransfer = transfers.find(
      (transfer) =>
        ownerByAssetKey.get(transfer.assetKey) !== transfer.fromObjectiveId,
    );
    if (invalidTransfer) {
      throw new ApplicationError(
        "Uma posição mudou de destino desde a busca. Atualize os objetivos e tente novamente.",
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
      ...(transfers.length ? { transfers } : {}),
    });
    logger.info("emergency_reserve_settings_saved", {
      requestId,
      selectedGroups: selectedAssetKeys.length,
    });
    return this.getEditorData(requestId);
  }

  private addTransferDetails(
    candidate: ReservePositionSuggestion,
    holdings: Map<
      string,
      {
        product: string;
        value: number | null;
        assignedObjectiveId: string | null;
        assignedObjectiveName: string | null;
      }
    >,
    valueByAsset: Map<string, number | null>,
    objectiveById: Map<string, ReserveImpactObjective>,
    targetAmount: number | null,
  ): ReservePositionSuggestion {
    const transfers = candidate.assetKeys.flatMap((assetKey) => {
      const holding = holdings.get(assetKey);
      if (
        !holding ||
        !holding.assignedObjectiveId ||
        holding.assignedObjectiveId === reserveObjectiveId
      ) {
        return [];
      }
      return [
        {
          assetKey,
          product: holding.product,
          value: holding.value!,
          fromObjectiveId: holding.assignedObjectiveId,
          fromObjectiveName: holding.assignedObjectiveName!,
          toObjectiveId: reserveObjectiveId,
        },
      ];
    });
    const transferValueByObjective = new Map<string, number>();
    for (const transfer of transfers) {
      transferValueByObjective.set(
        transfer.fromObjectiveId,
        (transferValueByObjective.get(transfer.fromObjectiveId) ?? 0) +
          (valueByAsset.get(transfer.assetKey) ?? transfer.value),
      );
    }
    const impacts = [
      {
        objectiveId: reserveObjectiveId,
        objectiveName: "Reserva",
        currentValue: candidate.total,
        knownValue: candidate.total,
        targetAmount,
        progressPercent:
          targetAmount === null
            ? null
            : Math.min((candidate.total / targetAmount) * 100, 100),
        transferredValue: transfers.reduce(
          (total, transfer) =>
            total + (valueByAsset.get(transfer.assetKey) ?? transfer.value),
          0,
        ),
        transferredPositionCount: transfers.length,
      },
      ...[...transferValueByObjective].map(
        ([objectiveId, transferredValue]) => {
          const objective = objectiveById.get(objectiveId);
          const currentValue =
            objective?.currentValue === null ||
            objective?.currentValue === undefined
              ? null
              : Math.max(objective.currentValue - transferredValue, 0);
          return {
            objectiveId,
            objectiveName: objective?.name ?? "Outro objetivo",
            currentValue,
            knownValue: Math.max(
              (objective?.knownValue ?? 0) - transferredValue,
              0,
            ),
            targetAmount: objective?.targetAmount ?? null,
            progressPercent:
              currentValue === null || !objective?.targetAmount
                ? null
                : Math.min((currentValue / objective.targetAmount) * 100, 100),
            transferredValue,
            transferredPositionCount: transfers.filter(
              (transfer) => transfer.fromObjectiveId === objectiveId,
            ).length,
          };
        },
      ),
    ];
    return { ...candidate, transfers, impacts };
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
        valueCents: bigint;
        hasValue: boolean;
        valueSource: PortfolioMoneySource;
      }
    >();

    const fixedIncomePositions = positions.filter(isReserveFixedIncomePosition);
    for (const position of fixedIncomePositions) {
      const assetKey = getEmergencyReserveAssetKey(position);
      const valueCents = getPositionValue(position);
      const existing = groups.get(assetKey);
      if (existing) {
        existing.positionCount += 1;
        if (valueCents === null) existing.unvaluedPositions += 1;
        else {
          existing.valueCents += valueCents;
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
        unvaluedPositions: valueCents === null ? 1 : 0,
        valueCents: valueCents ?? 0n,
        hasValue: valueCents !== null,
        valueSource:
          position.canonicalValueSource ??
          resolvePositionMoney(position).source,
      });
    }

    const selected = new Set(settings.selectedAssetKeys);
    const holdings = [...groups.values()]
      .map((group) => ({
        ...group,
        valueCents: group.hasValue ? group.valueCents.toString() : null,
        value: group.hasValue ? centsToNumber(group.valueCents) : null,
        selected: selected.has(group.assetKey),
        assignedObjectiveId: ownerByAssetKey.get(group.assetKey)?.id ?? null,
        assignedObjectiveName:
          ownerByAssetKey.get(group.assetKey)?.name ?? null,
      }))
      .sort((left, right) =>
        left.product.localeCompare(right.product, "pt-BR"),
      );
    const selectedHoldings = holdings.filter((holding) => holding.selected);
    const selectedValueCents = sumMoneyCents(
      selectedHoldings.map((holding) =>
        holding.valueCents === null ? null : BigInt(holding.valueCents),
      ),
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
      selectedValue: centsToNumber(selectedValueCents)!,
      selectedValueCents: selectedValueCents.toString(),
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
