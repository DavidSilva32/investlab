import { randomUUID } from "node:crypto";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { mcpAdminReadToolsController } from "@/backend/controllers/mcp-admin-read-tools.controller";
import { mcpPortfolioReadToolsController } from "@/backend/controllers/mcp-portfolio-read-tools.controller";
import { mcpAuthenticationService } from "@/backend/services/mcp-authentication.service";

type VerifiedClaims = { sub?: unknown; scope?: unknown; scp?: unknown };

function scopesFromClaims(claims: VerifiedClaims): string[] {
  const scopes = claims.scope ?? claims.scp;
  if (Array.isArray(scopes)) {
    return scopes.filter((scope): scope is string => typeof scope === "string");
  }
  return typeof scopes === "string" ? scopes.split(/\s+/).filter(Boolean) : [];
}

export class McpController {
  async handle(request: Request, claims: VerifiedClaims) {
    const principal = await mcpAuthenticationService.resolvePrincipal(
      claims.sub,
    );
    const scopes = scopesFromClaims(claims);
    const requestId = randomUUID();
    const handler = createMcpHandler(
      () => {
        const server = new McpServer(
          { name: "InvestLab", version: "1.0.0" },
          {
            instructions:
              "Use the connected account's domain-specific read tools and combine them when a question spans portfolio, objectives, operations, allocation, strategy, reserve, monthly review, B3 market quotes, or objective simulations. Clearly label simulations as hypothetical, and quotes with their observation timestamp; never describe observed balance changes as investment returns. Administrative tools require explicit admin scope and a specific targetUserId.",
          },
        );
        mcpPortfolioReadToolsController.register(
          server,
          principal.userId,
          requestId,
        );
        if (principal.role === "ADMIN" && scopes.includes("mcp:admin:read")) {
          mcpAdminReadToolsController.register(
            server,
            { sub: principal.userId, scope: scopes },
            requestId,
          );
        }
        return server;
      },
      { legacy: "reject" },
    );
    return handler.fetch(request);
  }
}

export const mcpController = new McpController();
