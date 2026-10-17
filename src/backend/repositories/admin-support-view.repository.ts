import { and, desc, eq } from "drizzle-orm";
import { authUsers } from "@/infrastructure/database/schema";
import { getDatabaseClient } from "@/infrastructure/database/client";

export class AdminSupportViewRepository {
  async listTargets(actorUserId: string) {
    const [actor] = await getDatabaseClient()
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, actorUserId),
          eq(authUsers.role, "ADMIN"),
          eq(authUsers.accountStatus, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!actor) return { kind: "actor-not-authorized" as const };
    const targets = await getDatabaseClient()
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(
        and(eq(authUsers.role, "USER"), eq(authUsers.accountStatus, "ACTIVE")),
      )
      .orderBy(desc(authUsers.createdAt));
    return { kind: "listed" as const, targets };
  }

  async getActiveTarget(actorUserId: string, targetUserId: string) {
    const [actor] = await getDatabaseClient()
      .select({ id: authUsers.id })
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, actorUserId),
          eq(authUsers.role, "ADMIN"),
          eq(authUsers.accountStatus, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!actor) return { kind: "actor-not-authorized" as const };
    const [target] = await getDatabaseClient()
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
      })
      .from(authUsers)
      .where(
        and(
          eq(authUsers.id, targetUserId),
          eq(authUsers.role, "USER"),
          eq(authUsers.accountStatus, "ACTIVE"),
        ),
      )
      .limit(1);
    return target
      ? { kind: "found" as const, target }
      : { kind: "target-not-found" as const };
  }
}

export const adminSupportViewRepository = new AdminSupportViewRepository();
