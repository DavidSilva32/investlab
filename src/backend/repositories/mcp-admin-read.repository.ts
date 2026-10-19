import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { authUsers } from "@/infrastructure/database/schema";

export class McpAdminReadRepository {
  async listUsers(page: number, pageSize: number) {
    const database = getDatabaseClient();
    const [{ total }] = await database
      .select({ total: count() })
      .from(authUsers);
    const users = await database
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        status: authUsers.accountStatus,
      })
      .from(authUsers)
      .orderBy(asc(authUsers.name), asc(authUsers.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { users, total, page, pageSize };
  }

  async searchUsers(query: string, page: number, pageSize: number) {
    const escapedQuery = query.trim().replace(/[\\%_]/g, "\\$&");
    const condition = or(
      ilike(authUsers.name, `%${escapedQuery}%`),
      ilike(authUsers.email, `%${escapedQuery}%`),
    );
    const database = getDatabaseClient();
    const [{ total }] = await database
      .select({ total: count() })
      .from(authUsers)
      .where(condition);
    const users = await database
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        status: authUsers.accountStatus,
      })
      .from(authUsers)
      .where(condition)
      .orderBy(asc(authUsers.name), asc(authUsers.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { users, total, page, pageSize };
  }

  async findUser(userId: string) {
    const [user] = await getDatabaseClient()
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        status: authUsers.accountStatus,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    return user ?? null;
  }
}

export const mcpAdminReadRepository = new McpAdminReadRepository();
