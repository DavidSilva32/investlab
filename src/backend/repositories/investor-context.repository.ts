import { eq } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { logger } from "@/infrastructure/logging/logger";
import { investorContextSettings } from "@/infrastructure/database/schema";

const singletonId = "default";

export class InvestorContextRepository {
  async get(requestId?: string) {
    try {
      const [settings] = await getDatabaseClient()
        .select()
        .from(investorContextSettings)
        .where(eq(investorContextSettings.id, singletonId))
        .limit(1);
      return {
        objective: settings?.objective ?? null,
        targetMonth: settings?.targetMonth ?? null,
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
      };
    } catch (error) {
      logger.error("investor_context_query_failed", {
        requestId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  }

  async save(
    input: { objective: string | null; targetMonth: string | null },
    requestId?: string,
  ) {
    try {
      const [settings] = await getDatabaseClient()
        .insert(investorContextSettings)
        .values({ id: singletonId, ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: investorContextSettings.id,
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      return {
        objective: settings.objective,
        targetMonth: settings.targetMonth,
        updatedAt: settings.updatedAt.toISOString(),
      };
    } catch (error) {
      logger.error("investor_context_update_failed", {
        requestId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  }
}

export const investorContextRepository = new InvestorContextRepository();
