import { eq } from "drizzle-orm";
import { ApplicationError } from "@/backend/errors/application-error";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { getDatabaseClient } from "@/infrastructure/database/client";
import { authUsers } from "@/infrastructure/database/schema";

export type McpPrincipal = {
  userId: string;
  role: "USER" | "ADMIN";
};

export class McpAuthenticationService {
  async resolvePrincipal(subject: unknown): Promise<McpPrincipal> {
    if (typeof subject !== "string" || subject.length === 0) {
      throw new ApplicationError("Token MCP sem identidade válida.", 401);
    }
    const [user] = await getDatabaseClient()
      .select({
        id: authUsers.id,
        role: authUsers.role,
        status: authUsers.accountStatus,
      })
      .from(authUsers)
      .where(eq(authUsers.id, subject))
      .limit(1);
    if (!user || user.status !== "ACTIVE") {
      throw new ApplicationError(
        "A conta não está disponível para o MCP.",
        401,
      );
    }
    if (user.role !== "USER" && user.role !== "ADMIN") {
      throw new ApplicationError(
        "A conta não está disponível para o MCP.",
        401,
      );
    }
    if (!(await privacyCenterService.hasAcceptedCurrentTerms(user.id))) {
      throw new ApplicationError(
        "Aceite os Termos de Uso atuais na plataforma para conectar o MCP.",
        403,
      );
    }
    return { userId: user.id, role: user.role };
  }
}

export const mcpAuthenticationService = new McpAuthenticationService();
