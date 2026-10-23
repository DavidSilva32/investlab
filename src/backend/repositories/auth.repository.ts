import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  authAccounts,
  authInvitations,
  authPasswordResets,
  authRateLimits,
  authSessions,
  authTermsAcceptances,
  authUsers,
  authVerifications,
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
  oauthClients,
  positionItems,
  positionReconciliationEvents,
  positionSnapshots,
  stockOpportunityAnalysisSettings,
  stockOpportunityManualInputs,
  treasuryPositionLiquidityFacts,
  tradingItems,
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
        phone: authUsers.phone,
        role: authUsers.role,
        accountStatus: authUsers.accountStatus,
        betaActivatedAt: authUsers.betaActivatedAt,
        betaExpiresAt: authUsers.betaExpiresAt,
        lastLoginAt: authUsers.lastLoginAt,
        createdAt: authUsers.createdAt,
        updatedAt: authUsers.updatedAt,
      })
      .from(authUsers)
      .orderBy(desc(authUsers.createdAt));
  }

  async updateOwnProfile(input: {
    id: string;
    name: string;
    phone?: string | null;
  }) {
    const updates = {
      name: input.name,
      updatedAt: new Date(),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    };
    const [user] = await getDatabaseClient()
      .update(authUsers)
      .set(updates)
      .where(eq(authUsers.id, input.id))
      .returning({ name: authUsers.name, phone: authUsers.phone });
    return user ?? null;
  }

  async getLoginEligibility(email: string) {
    const [user] = await getDatabaseClient()
      .select({ id: authUsers.id, accountStatus: authUsers.accountStatus })
      .from(authUsers)
      .where(eq(authUsers.email, email))
      .limit(1);
    return user ?? null;
  }

  async recordSuccessfulLogin(email: string) {
    return getDatabaseClient().transaction(async (transaction) => {
      const now = new Date();
      const [updated] = await transaction
        .update(authUsers)
        .set({
          accountStatus: "ACTIVE",
          lastLoginAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(authUsers.email, email),
            sql`${authUsers.accountStatus} <> 'DISABLED'`,
          ),
        )
        .returning({ id: authUsers.id });
      if (updated) return true;

      const [user] = await transaction
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.email, email))
        .limit(1);
      if (user) {
        await transaction
          .delete(authSessions)
          .where(eq(authSessions.userId, user.id));
      }
      return false;
    });
  }

  async updateManagedUser(input: {
    id: string;
    actorId: string;
    name?: string;
    role?: "USER" | "ADMIN";
    isActive?: boolean;
    betaExpiresAt?: Date;
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('investlab-auth-user-lifecycle'))`,
      );
      const [target] = await transaction
        .select({
          id: authUsers.id,
          role: authUsers.role,
          accountStatus: authUsers.accountStatus,
          betaExpiresAt: authUsers.betaExpiresAt,
        })
        .from(authUsers)
        .where(eq(authUsers.id, input.id))
        .for("update")
        .limit(1);
      if (!target) return { kind: "not-found" as const };
      if (
        input.betaExpiresAt &&
        target.betaExpiresAt &&
        input.betaExpiresAt.getTime() <= target.betaExpiresAt.getTime()
      ) {
        return { kind: "trial-not-extended" as const };
      }
      if (input.actorId === target.id && input.isActive === false) {
        return { kind: "self-deactivation" as const };
      }

      const removesActiveAdmin =
        target.accountStatus !== "DISABLED" &&
        target.role === "ADMIN" &&
        (input.isActive === false || input.role === "USER");
      if (removesActiveAdmin) {
        const [result] = await transaction
          .select({ total: sql<number>`count(*)::int` })
          .from(authUsers)
          .where(
            and(
              eq(authUsers.role, "ADMIN"),
              sql`${authUsers.accountStatus} <> 'DISABLED'`,
            ),
          );
        if (result.total <= 1) {
          return { kind: "last-admin" as const };
        }
      }

      const updates: {
        updatedAt: Date;
        name?: string;
        role?: "USER" | "ADMIN";
        accountStatus?: "ACTIVE" | "DISABLED";
        betaExpiresAt?: Date;
      } = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.role !== undefined) updates.role = input.role;
      if (input.isActive !== undefined) {
        updates.accountStatus = input.isActive ? "ACTIVE" : "DISABLED";
      }
      if (input.betaExpiresAt !== undefined) {
        updates.betaExpiresAt = input.betaExpiresAt;
      }

      const [updated] = await transaction
        .update(authUsers)
        .set(updates)
        .where(eq(authUsers.id, target.id))
        .returning({ id: authUsers.id });
      if (!updated) return { kind: "not-found" as const };
      if (target.accountStatus !== "DISABLED" && input.isActive === false) {
        await transaction
          .delete(authSessions)
          .where(eq(authSessions.userId, target.id));
      }
      return { kind: "updated" as const };
    });
  }

  async deleteManagedUser(input: { id: string; actorId: string }) {
    return getDatabaseClient().transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('investlab-auth-user-lifecycle'))`,
      );
      const [target] = await transaction
        .select({
          id: authUsers.id,
          email: authUsers.email,
          role: authUsers.role,
          accountStatus: authUsers.accountStatus,
        })
        .from(authUsers)
        .where(eq(authUsers.id, input.id))
        .for("update")
        .limit(1);
      if (!target) return { kind: "not-found" as const };
      if (target.id === input.actorId) return { kind: "self-delete" as const };

      if (target.role === "ADMIN" && target.accountStatus !== "DISABLED") {
        const [result] = await transaction
          .select({ total: sql<number>`count(*)::int` })
          .from(authUsers)
          .where(
            and(
              eq(authUsers.role, "ADMIN"),
              sql`${authUsers.accountStatus} <> 'DISABLED'`,
            ),
          );
        if (result.total <= 1) return { kind: "last-admin" as const };
      }

      // Remove restrictive history links before the account-owned records.
      // Earlier reconciliation rows may have a NULL owner because ownership
      // was added after those rows were created. Resolve ownership through the
      // referenced account-owned operations before removing either parent.
      await transaction.execute(sql`
        delete from "b3_reconciliation_events" as reconciliation
        where reconciliation."userId" = ${target.id}
          or exists (
            select 1 from "trading_items" trading
            where trading.id = reconciliation."tradingItemId"
              and trading."userId" = ${target.id}
          )
          or exists (
            select 1 from "movement_items" movement
            where movement.id = reconciliation."movementItemId"
              and movement."userId" = ${target.id}
          )
      `);
      await transaction.execute(sql`
        delete from "portfolio_operation_reconciliation_events" as reconciliation
        where reconciliation."userId" = ${target.id}
          or exists (
            select 1 from "manual_portfolio_operations" operation
            where operation.id = reconciliation."operationId"
              and operation."userId" = ${target.id}
          )
          or exists (
            select 1 from "movement_items" movement
            where movement.id = reconciliation."movementId"
              and movement."userId" = ${target.id}
          )
      `);
      await transaction
        .delete(positionItems)
        .where(eq(positionItems.userId, target.id));
      await transaction
        .delete(positionSnapshots)
        .where(eq(positionSnapshots.userId, target.id));
      await transaction
        .delete(movementItems)
        .where(eq(movementItems.userId, target.id));
      await transaction
        .delete(tradingItems)
        .where(eq(tradingItems.userId, target.id));
      await transaction.delete(imports).where(eq(imports.userId, target.id));

      await transaction
        .delete(authTermsAcceptances)
        .where(eq(authTermsAcceptances.userId, target.id));
      await transaction
        .delete(authVerifications)
        .where(eq(authVerifications.identifier, target.email));
      await transaction
        .delete(authInvitations)
        .where(eq(authInvitations.createdByUserId, target.id));
      await transaction
        .delete(authPasswordResets)
        .where(
          sql`${authPasswordResets.userId} = ${target.id} OR ${authPasswordResets.createdByUserId} = ${target.id}`,
        );

      // OAuth grants can reference the account directly or its registered clients.
      await transaction.execute(sql`
        delete from "oauthAccessToken"
        where "userId" = ${target.id}
          or "clientId" in (select "clientId" from "oauthClient" where "userId" = ${target.id})
          or "refreshId" in (select id from "oauthRefreshToken" where "userId" = ${target.id})
      `);
      await transaction.execute(sql`
        delete from "oauthRefreshToken"
        where "userId" = ${target.id}
          or "clientId" in (select "clientId" from "oauthClient" where "userId" = ${target.id})
      `);
      await transaction.execute(sql`
        delete from "oauthConsent"
        where "userId" = ${target.id}
          or "clientId" in (select "clientId" from "oauthClient" where "userId" = ${target.id})
      `);
      await transaction
        .delete(oauthClients)
        .where(eq(oauthClients.userId, target.id));

      const [deleted] = await transaction
        .delete(authUsers)
        .where(eq(authUsers.id, target.id))
        .returning({ id: authUsers.id });
      return deleted
        ? { kind: "deleted" as const }
        : { kind: "not-found" as const };
    });
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

  async activateInvitation(input: {
    tokenHash: string;
    name: string;
    passwordHash: string;
    termsVersion: string;
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      const acceptedAt = new Date();
      const [invitation] = await transaction
        .update(authInvitations)
        .set({ usedAt: acceptedAt })
        .where(
          and(
            eq(authInvitations.tokenHash, input.tokenHash),
            isNull(authInvitations.usedAt),
            isNull(authInvitations.revokedAt),
            gt(authInvitations.expiresAt, acceptedAt),
          ),
        )
        .returning({ email: authInvitations.email });
      if (!invitation) return false;

      const userId = randomUUID();
      await transaction.insert(authUsers).values({
        id: userId,
        name: input.name,
        email: invitation.email,
        emailVerified: false,
        role: "USER",
        accountStatus: "PENDING",
        betaActivatedAt: acceptedAt,
        betaExpiresAt: new Date(
          acceptedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        ),
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      });
      await transaction.insert(authAccounts).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: input.passwordHash,
        createdAt: acceptedAt,
        updatedAt: acceptedAt,
      });
      await transaction.insert(authTermsAcceptances).values({
        userId,
        termsVersion: input.termsVersion,
        acceptedAt,
      });
      return true;
    });
  }

  async createPublicBetaAccount(input: {
    email: string;
    name: string;
    passwordHash: string;
    termsVersion: string;
  }) {
    return getDatabaseClient().transaction(async (transaction) => {
      const createdAt = new Date();
      const userId = randomUUID();
      await transaction.insert(authUsers).values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: false,
        role: "USER",
        accountStatus: "PENDING",
        betaActivatedAt: createdAt,
        betaExpiresAt: new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
        createdAt,
        updatedAt: createdAt,
      });
      await transaction.insert(authAccounts).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: input.passwordHash,
        createdAt,
        updatedAt: createdAt,
      });
      await transaction.insert(authTermsAcceptances).values({
        userId,
        termsVersion: input.termsVersion,
        acceptedAt: createdAt,
      });
      return true;
    });
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

  async findUserById(id: string) {
    const [user] = await getDatabaseClient()
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, id))
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
