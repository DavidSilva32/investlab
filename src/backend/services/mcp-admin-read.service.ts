import { ApplicationError } from "@/backend/errors/application-error";
import { mcpAdminReadRepository } from "@/backend/repositories/mcp-admin-read.repository";
import { mcpAuthenticationService } from "@/backend/services/mcp-authentication.service";
import { mcpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";
import { logger } from "@/infrastructure/logging/logger";

const adminReadScope = "mcp:admin:read";
const maximumPageSize = 50;

export class McpAdminReadService {
  private async requireAdminRead(actorUserId: string, scopes: string[]) {
    if (!scopes.includes(adminReadScope)) {
      throw new ApplicationError(
        "A conexão precisa da permissão administrativa de leitura.",
        403,
      );
    }
    const actor = await mcpAuthenticationService.resolvePrincipal(actorUserId);
    if (actor.role !== "ADMIN") {
      throw new ApplicationError(
        "Esta operação está disponível somente para administradores.",
        403,
      );
    }
    return actor;
  }

  private validatePage(page: number, pageSize: number) {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 50_000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > maximumPageSize
    ) {
      throw new ApplicationError("Revise a paginação solicitada.", 400);
    }
  }

  async listUsers(
    actorUserId: string,
    scopes: string[],
    page: number,
    pageSize: number,
    requestId: string,
  ) {
    const actor = await this.requireAdminRead(actorUserId, scopes);
    this.validatePage(page, pageSize);
    logger.info("mcp_admin_user_list", {
      actorUserId: actor.userId,
      requestId,
      page,
      pageSize,
    });
    return mcpAdminReadRepository.listUsers(page, pageSize);
  }

  async searchUsers(
    actorUserId: string,
    scopes: string[],
    query: string,
    page: number,
    pageSize: number,
    requestId: string,
  ) {
    const actor = await this.requireAdminRead(actorUserId, scopes);
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 120) {
      throw new ApplicationError(
        "Informe ao menos 2 caracteres para localizar uma conta.",
        400,
      );
    }
    this.validatePage(page, pageSize);
    logger.info("mcp_admin_user_search", {
      actorUserId: actor.userId,
      requestId,
      page,
      pageSize,
      queryLength: normalizedQuery.length,
    });
    return mcpAdminReadRepository.searchUsers(normalizedQuery, page, pageSize);
  }

  async getUserPortfolio(
    actorUserId: string,
    scopes: string[],
    targetUserId: string,
    requestId: string,
  ) {
    const actor = await this.requireAdminRead(actorUserId, scopes);
    if (!targetUserId.trim()) {
      throw new ApplicationError("Informe a conta que deseja consultar.", 400);
    }
    logger.info("mcp_admin_user_portfolio_read", {
      actorUserId: actor.userId,
      targetUserId,
      requestId,
    });
    const target = await mcpAdminReadRepository.findUser(targetUserId);
    if (!target) {
      throw new ApplicationError("A conta informada não existe.", 404);
    }
    return {
      user: target,
      portfolio: await mcpPortfolioToolsService.getMyPortfolio(
        target.id,
        requestId,
      ),
    };
  }
}

export const mcpAdminReadService = new McpAdminReadService();
