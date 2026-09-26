import { createHash } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { importRepository } from "@/backend/repositories/import.repository";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { portfolioAllocationService } from "@/backend/services/portfolio-allocation.service";
import { inferPortfolioAssetClassification } from "@/backend/services/portfolio-classification";
import { suggestEmergencyReservePositions } from "@/backend/services/emergency-reserve-position-suggestions";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";
import { logger } from "@/infrastructure/logging/logger";

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

const canonicalPart = (value: string | null | undefined) =>
  value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR") ?? "";

export function getEmergencyReserveAssetKey(position: Position) {
  const identity = [
    position.product,
    position.assetCode,
    position.institution,
    position.issuer,
    position.indexer,
    position.regimeType,
    position.issuedAt,
    position.maturityAt,
  ].map(canonicalPart);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `v1:${fingerprint}`;
}

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
    const [rawPositions, settings] = await Promise.all([
      importRepository.listLatestPositions(requestId),
      emergencyReserveRepository.getSettings(),
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
    const data = this.buildData(positions, {
      monthlyExpenses: settings?.monthlyExpenses ?? null,
      targetMonths: settings?.targetMonths ?? null,
      selectedAssetKeys: settings?.selectedAssetKeys ?? [],
    });
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
    const holdings = this.buildData(positions, {
      monthlyExpenses: null,
      targetMonths: null,
      selectedAssetKeys: [],
    }).holdings;
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

  private buildData(positions: Position[], settings: ReserveSettings) {
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
