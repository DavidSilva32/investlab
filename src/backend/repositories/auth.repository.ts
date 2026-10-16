import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  authAccounts,
  authInvitations,
  authPasswordResets,
  authRateLimits,
  authSessions,
  authUsers,
  cdbRateConfigurations,
  emergencyReserveSettings,
  imports,
  manualPortfolioAdjustmentEvents,
  manualPortfolioOperations,
  manualPortfolioPositionSnapshots,
  manualPortfolioPositions,
  movementItems,
  personalInvestmentStrategy,
  portfolioAllocationTargets,
  portfolioAssetClassifications,
  portfolioObjectiveBalanceReferences,
  portfolioObjectivePositions,
  portfolioObjectiveReferenceBatches,
  portfolioObjectives,
  portfolioOperationReconciliationEvents,
  positionItems,
  positionReconciliationEvents,
  positionSnapshots,
  stockOpportunityAnalysisSettings,
  stockOpportunityManualInputs,
  treasuryPositionLiquidityFacts,
} from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class AuthRepository {
  async checkAuthenticationRateLimits(input: {
    keys: Array<{ key: string; maximum: number }>;
    now: number;
    windowMs: number;
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      // Better Auth and the custom login limiter share this table. A day is
      // longer than either configured rate window; the indexed cleanup keeps
      // keys from accumulating without needing a scheduled job.
      await transaction
        .delete(authRateLimits)
        .where(lt(authRateLimits.lastRequest, input.now - 24 * 60 * 60 * 1000));
      let retryAfterSeconds = 0;
      for (const { key, maximum } of input.keys) {
        const [counter] = await transaction
          .insert(authRateLimits)
          .values({ id: randomUUID(), key, count: 1, lastRequest: input.now })
          .onConflictDoUpdate({
            target: authRateLimits.key,
            set: {
              count: sql`CASE WHEN ${authRateLimits.lastRequest} <= ${input.now - input.windowMs} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
              lastRequest: sql`CASE WHEN ${authRateLimits.lastRequest} <= ${input.now - input.windowMs} THEN ${input.now} ELSE ${authRateLimits.lastRequest} END`,
            },
          })
          .returning({
            count: authRateLimits.count,
            lastRequest: authRateLimits.lastRequest,
          });
        if (counter.count > maximum) {
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.ceil(
              (counter.lastRequest + input.windowMs - input.now) / 1000,
            ),
          );
        }
      }
      return retryAfterSeconds > 0 ? retryAfterSeconds : null;
    });
  }

  async createInvitation(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string;
  }) {
    const [invitation] = await getDatabaseClient()
      .insert(authInvitations)
      .values(input)
      .returning({ id: authInvitations.id });
    return invitation;
  }

  async listUsers() {
    return getDatabaseClient()
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        createdAt: authUsers.createdAt,
      })
      .from(authUsers)
      .orderBy(desc(authUsers.createdAt));
  }

  async listInvitations() {
    return getDatabaseClient()
      .select({
        id: authInvitations.id,
        email: authInvitations.email,
        expiresAt: authInvitations.expiresAt,
        usedAt: authInvitations.usedAt,
        revokedAt: authInvitations.revokedAt,
        createdAt: authInvitations.createdAt,
      })
      .from(authInvitations)
      .orderBy(desc(authInvitations.createdAt));
  }

  async listPasswordResets() {
    return getDatabaseClient()
      .select({
        id: authPasswordResets.id,
        email: authUsers.email,
        expiresAt: authPasswordResets.expiresAt,
        usedAt: authPasswordResets.usedAt,
        revokedAt: authPasswordResets.revokedAt,
        createdAt: authPasswordResets.createdAt,
      })
      .from(authPasswordResets)
      .innerJoin(authUsers, eq(authUsers.id, authPasswordResets.userId))
      .orderBy(desc(authPasswordResets.createdAt));
  }

  async revokePasswordReset(id: string) {
    const [updated] = await getDatabaseClient()
      .update(authPasswordResets)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authPasswordResets.id, id),
          isNull(authPasswordResets.usedAt),
          isNull(authPasswordResets.revokedAt),
        ),
      )
      .returning({ id: authPasswordResets.id });
    return Boolean(updated);
  }

  async revokeInvitation(id: string) {
    const [updated] = await getDatabaseClient()
      .update(authInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authInvitations.id, id),
          isNull(authInvitations.usedAt),
          isNull(authInvitations.revokedAt),
        ),
      )
      .returning({ id: authInvitations.id });
    return Boolean(updated);
  }

  async claimInvitation(tokenHash: string) {
    const [claimed] = await getDatabaseClient()
      .update(authInvitations)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authInvitations.tokenHash, tokenHash),
          isNull(authInvitations.usedAt),
          isNull(authInvitations.revokedAt),
          gt(authInvitations.expiresAt, new Date()),
        ),
      )
      .returning({ id: authInvitations.id, email: authInvitations.email });
    return claimed ?? null;
  }

  async releaseInvitationClaim(id: string) {
    const [released] = await getDatabaseClient()
      .update(authInvitations)
      .set({ usedAt: null })
      .where(
        and(
          eq(authInvitations.id, id),
          isNull(authInvitations.revokedAt),
          gt(authInvitations.expiresAt, new Date()),
        ),
      )
      .returning({ id: authInvitations.id });
    return Boolean(released);
  }

  async findUserByEmail(email: string) {
    const [user] = await getDatabaseClient()
      .select({
        id: authUsers.id,
        email: authUsers.email,
        role: authUsers.role,
      })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);
    return user ?? null;
  }

  async createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string;
  }) {
    const [reset] = await getDatabaseClient()
      .insert(authPasswordResets)
      .values(input)
      .returning({ id: authPasswordResets.id });
    return reset;
  }

  async applyPasswordReset(tokenHash: string, passwordHash: string) {
    return getDatabaseClient().transaction(async (transaction) => {
      const [reset] = await transaction
        .update(authPasswordResets)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(authPasswordResets.tokenHash, tokenHash),
            isNull(authPasswordResets.usedAt),
            isNull(authPasswordResets.revokedAt),
            gt(authPasswordResets.expiresAt, new Date()),
          ),
        )
        .returning({ userId: authPasswordResets.userId });
      if (!reset) return false;
      await transaction
        .update(authAccounts)
        .set({ password: passwordHash, updatedAt: new Date() })
        .where(
          and(
            eq(authAccounts.userId, reset.userId),
            eq(authAccounts.providerId, "credential"),
          ),
        );
      await transaction
        .delete(authSessions)
        .where(eq(authSessions.userId, reset.userId));
      return true;
    });
  }

  async promoteLegacyAdmin(email: string) {
    return getDatabaseClient().transaction(async (transaction) => {
      const [user] = await transaction
        .update(authUsers)
        .set({ role: "ADMIN", updatedAt: new Date() })
        .where(eq(authUsers.email, email))
        .returning({ id: authUsers.id, role: authUsers.role });
      if (!user || user.role !== "ADMIN") return null;

      // Rows without an owner are legacy data. New writes always carry an
      // owner; this update is safe to repeat after an interrupted bootstrap.
      const legacyTables = [
        imports,
        positionSnapshots,
        positionItems,
        treasuryPositionLiquidityFacts,
        manualPortfolioPositions,
        manualPortfolioPositionSnapshots,
        manualPortfolioAdjustmentEvents,
        positionReconciliationEvents,
        cdbRateConfigurations,
        emergencyReserveSettings,
        portfolioObjectives,
        portfolioObjectivePositions,
        portfolioObjectiveReferenceBatches,
        portfolioObjectiveBalanceReferences,
        portfolioAllocationTargets,
        personalInvestmentStrategy,
        movementItems,
        manualPortfolioOperations,
        portfolioOperationReconciliationEvents,
        stockOpportunityManualInputs,
        stockOpportunityAnalysisSettings,
        portfolioAssetClassifications,
      ] as const;
      for (const table of legacyTables) {
        await transaction
          .update(table)
          .set({ userId: user.id })
          .where(isNull(table.userId));
      }
      // These tables keep one settings row per account. Give each row a
      // stable globally unique key while retaining its existing primary key.
      for (const table of [
        emergencyReserveSettings,
        portfolioAllocationTargets,
        personalInvestmentStrategy,
        stockOpportunityAnalysisSettings,
      ] as const) {
        await transaction
          .update(table)
          .set({ id: user.id })
          .where(eq(table.userId, user.id));
      }
      return { id: user.id };
    });
  }

  async hasAnyUser() {
    const [user] = await getDatabaseClient()
      .select({ id: authUsers.id })
      .from(authUsers)
      .limit(1);
    return Boolean(user);
  }

  async claimInvitationExistsUnused(tokenHash: string) {
    const [row] = await getDatabaseClient()
      .select({ id: authInvitations.id })
      .from(authInvitations)
      .where(
        and(
          eq(authInvitations.tokenHash, tokenHash),
          isNull(authInvitations.usedAt),
          isNull(authInvitations.revokedAt),
          gt(authInvitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}

export const authRepository = new AuthRepository();
