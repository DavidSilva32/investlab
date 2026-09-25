import { createHash } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { importRepository } from "@/backend/repositories/import.repository";
import { cdbEstimateService } from "@/backend/services/cdb-estimate.service";
import { calculateEmergencyReserve } from "@/lib/emergency-reserve";
import { logger } from "@/infrastructure/logging/logger";

const settingsSchema = z.object({
  monthlyExpenses: z.number().finite().positive().max(1_000_000_000_000),
  targetMonths: z.number().int().min(1).max(1200),
  selectedAssetKeys: z.array(z.string().regex(/^v1:[a-f0-9]{64}$/)).max(500),
});

type Position = Awaited<
  ReturnType<typeof importRepository.listLatestPositions>
>[number] & {
  estimatedValue?: number | null;
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
    const positions = await cdbEstimateService.enrich(rawPositions);
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

  async getSummary(positions: Position[], requestId?: string) {
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

  async saveSettings(body: unknown, requestId?: string) {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success)
      throw new ApplicationError(
        "Informe um custo mensal, uma meta em meses e uma seleção válida de investimentos.",
        400,
      );

    const selectedAssetKeys = [...new Set(parsed.data.selectedAssetKeys)];
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

    for (const position of positions) {
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
    const referenceDate = positions[0]?.referenceDate ?? null;
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
