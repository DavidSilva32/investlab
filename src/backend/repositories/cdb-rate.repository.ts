import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import {
  cdbRateConfigurations,
  cdiDailyRates,
} from "@/infrastructure/database/schema";

export class CdbRateRepository {
  async listConfigurations(assetCodes: string[]) {
    if (!assetCodes.length) return [];
    return getDatabaseClient()
      .select()
      .from(cdbRateConfigurations)
      .where(inArray(cdbRateConfigurations.assetCode, assetCodes));
  }

  async upsert(assetCode: string, cdiPercentage: string) {
    return (
      await getDatabaseClient()
        .insert(cdbRateConfigurations)
        .values({ assetCode, cdiPercentage })
        .onConflictDoUpdate({
          target: cdbRateConfigurations.assetCode,
          set: { cdiPercentage, updatedAt: new Date() },
        })
        .returning()
    )[0];
  }

  async configureMissing(assetCodes: string[], cdiPercentage: string) {
    if (!assetCodes.length) return 0;
    return (
      await getDatabaseClient()
        .insert(cdbRateConfigurations)
        .values(assetCodes.map((assetCode) => ({ assetCode, cdiPercentage })))
        .onConflictDoNothing()
        .returning()
    ).length;
  }

  async listRatesAfter(baseDate: string, today: string) {
    return getDatabaseClient()
      .select()
      .from(cdiDailyRates)
      .where(
        and(
          gt(cdiDailyRates.rateDate, baseDate),
          lt(cdiDailyRates.rateDate, today),
        ),
      );
  }

  async cacheRates(rates: Array<{ date: string; annualRate: string }>) {
    if (!rates.length) return;
    await getDatabaseClient()
      .insert(cdiDailyRates)
      .values(
        rates.map((rate) => ({
          rateDate: rate.date,
          annualRate: rate.annualRate,
        })),
      )
      .onConflictDoNothing();
  }
}

export const cdbRateRepository = new CdbRateRepository();
