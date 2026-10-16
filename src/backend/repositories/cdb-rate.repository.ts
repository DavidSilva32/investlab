import { and, desc, eq, gt, inArray, lte, lt } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { requireDataOwnerId } from "@/infrastructure/auth/data-owner-context";
import {
  cdbRateConfigurations,
  cdiDailyRates,
} from "@/infrastructure/database/schema";

export class CdbRateRepository {
  async listConfigurations(assetCodes: string[]) {
    if (!assetCodes.length) return [];
    const userId = requireDataOwnerId();
    return getDatabaseClient()
      .select()
      .from(cdbRateConfigurations)
      .where(
        and(
          inArray(cdbRateConfigurations.assetCode, assetCodes),
          eq(cdbRateConfigurations.userId, userId),
        ),
      );
  }

  async upsert(assetCode: string, cdiPercentage: string) {
    const userId = requireDataOwnerId();
    return (
      await getDatabaseClient()
        .insert(cdbRateConfigurations)
        .values({ userId, assetCode, cdiPercentage })
        .onConflictDoUpdate({
          target: [
            cdbRateConfigurations.userId,
            cdbRateConfigurations.assetCode,
          ],
          set: { cdiPercentage, updatedAt: new Date() },
        })
        .returning()
    )[0];
  }

  async upsertMany(assetCodes: string[], cdiPercentage: string) {
    if (!assetCodes.length) return 0;
    const userId = requireDataOwnerId();
    return (
      await getDatabaseClient()
        .insert(cdbRateConfigurations)
        .values(
          assetCodes.map((assetCode) => ({ userId, assetCode, cdiPercentage })),
        )
        .onConflictDoUpdate({
          target: [
            cdbRateConfigurations.userId,
            cdbRateConfigurations.assetCode,
          ],
          set: { cdiPercentage, updatedAt: new Date() },
        })
        .returning()
    ).length;
  }

  async listRatesFrom(baseDate: string, today: string) {
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

  async listLatestRateOnOrBefore(date: string) {
    const [rate] = await getDatabaseClient()
      .select()
      .from(cdiDailyRates)
      .where(lte(cdiDailyRates.rateDate, date))
      .orderBy(desc(cdiDailyRates.rateDate))
      .limit(1);
    return rate ?? null;
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
