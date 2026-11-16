import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { financialRecurrencesRepository } from "@/backend/repositories/financial-recurrences.repository";
import { portfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import {
  calculateEmergencyReserve,
  calculateEssentialMonthlyBaseline,
} from "@/lib/emergency-reserve";
import { logger } from "@/infrastructure/logging/logger";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { decimalToCents } from "@/lib/portfolio-money";

const settingsSchema = z.object({
  monthlyExpenses: z.number().finite().positive().max(1_000_000_000_000),
  targetMonths: z.number().int().min(1).max(1200).nullable(),
});

export class EmergencyReserveService {
  async getSettingsData() {
    const [settings, recurrences] = await Promise.all([
      emergencyReserveRepository.getSettings(),
      financialRecurrencesRepository.listRecurrences(),
    ]);
    const baseline = calculateEssentialMonthlyBaseline(recurrences);
    return {
      monthlyExpenses:
        settings?.monthlyExpenses === null ||
        settings?.monthlyExpenses === undefined
          ? baseline.monthlyExpenses
          : Number(settings.monthlyExpenses),
      targetMonths: settings?.targetMonths ?? 6,
    };
  }

  async getSummary(requestId?: string) {
    const [settings, recurrences, references] = await Promise.all([
      emergencyReserveRepository.getSettings(),
      financialRecurrencesRepository.listRecurrences(),
      portfolioObjectivesRepository.listLatestBalanceReferences(),
    ]);
    const baseline = calculateEssentialMonthlyBaseline(recurrences);
    const observed = references.find(
      (reference) => reference.objectiveId === reserveObjectiveId,
    );
    const calculation = calculateEmergencyReserve({
      monthlyExpenses:
        settings?.monthlyExpenses === null ||
        settings?.monthlyExpenses === undefined
          ? baseline.monthlyExpenses
          : Number(settings.monthlyExpenses),
      monthlyExpensesCents:
        settings?.monthlyExpenses !== null &&
        settings?.monthlyExpenses !== undefined
          ? (decimalToCents(settings.monthlyExpenses)?.toString() ?? null)
          : baseline.monthlyExpensesCents,
      essentialMonthlyExpenses: baseline.monthlyExpenses,
      essentialExpenseSources: baseline.sources,
      targetMonths: settings?.targetMonths ?? 6,
      balance: observed ? Number(BigInt(observed.amountCents)) / 100 : null,
      balanceCents: observed?.amountCents ?? null,
      referenceDate: observed?.observedDate ?? null,
    });
    logger.info("emergency_reserve_summary_loaded", {
      requestId,
      hasObservedBalance: Boolean(observed),
      status: calculation.status,
    });
    return {
      ...calculation,
      hasObservedBalance: Boolean(observed),
      balanceCents: observed?.amountCents ?? null,
      balanceDate: observed?.observedDate ?? null,
    };
  }

  async getContributionContext() {
    const summary = await this.getSummary();
    return summary.hasObservedBalance ? summary : null;
  }

  async saveSettings(body: unknown, requestId?: string) {
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApplicationError(
        "Informe um custo mensal e uma meta em meses válidos.",
        400,
      );
    }

    await emergencyReserveRepository.saveSettings({
      monthlyExpenses: parsed.data.monthlyExpenses.toFixed(2),
      targetMonths: parsed.data.targetMonths,
    });
    logger.info("emergency_reserve_settings_saved", { requestId });
    return this.getSettingsData();
  }
}

export const emergencyReserveService = new EmergencyReserveService();
