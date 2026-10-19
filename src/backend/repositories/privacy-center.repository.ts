import { desc, eq, sql } from "drizzle-orm";
import { authTermsAcceptances } from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class PrivacyCenterRepository {
  async hasTermsAcceptance(userId: string, termsVersion: string) {
    const [acceptance] = await getDatabaseClient()
      .select({ id: authTermsAcceptances.id })
      .from(authTermsAcceptances)
      .where(
        sql`${authTermsAcceptances.userId} = ${userId} AND ${authTermsAcceptances.termsVersion} = ${termsVersion}`,
      )
      .limit(1);
    return Boolean(acceptance);
  }

  async recordTermsAcceptance(userId: string, termsVersion: string) {
    return getDatabaseClient().transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`terms-acceptance:${userId}`}))`,
      );
      const [existing] = await transaction
        .select({ id: authTermsAcceptances.id })
        .from(authTermsAcceptances)
        .where(
          sql`${authTermsAcceptances.userId} = ${userId} AND ${authTermsAcceptances.termsVersion} = ${termsVersion}`,
        )
        .limit(1);
      if (existing) return { recorded: false as const };

      const [acceptance] = await transaction
        .insert(authTermsAcceptances)
        .values({ userId, termsVersion })
        .returning({
          termsVersion: authTermsAcceptances.termsVersion,
          acceptedAt: authTermsAcceptances.acceptedAt,
        });
      return { recorded: true as const, acceptance };
    });
  }

  async listTermsAcceptances(userId: string) {
    return getDatabaseClient()
      .select({
        termsVersion: authTermsAcceptances.termsVersion,
        acceptedAt: authTermsAcceptances.acceptedAt,
      })
      .from(authTermsAcceptances)
      .where(eq(authTermsAcceptances.userId, userId))
      .orderBy(desc(authTermsAcceptances.acceptedAt));
  }
}

export const privacyCenterRepository = new PrivacyCenterRepository();
