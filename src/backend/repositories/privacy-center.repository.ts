import { desc, eq } from "drizzle-orm";
import { authTermsAcceptances } from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class PrivacyCenterRepository {
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
