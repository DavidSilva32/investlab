import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { toolError } from "@/backend/controllers/mcp-tool-result";
import { mcpAdminReadService } from "@/backend/services/mcp-admin-read.service";

type AdminReadClaims = { sub: string; scope: string[] };

export class McpAdminReadToolsController {
  register(server: McpServer, claims: AdminReadClaims, requestId: string) {
    server.registerTool(
      "admin_list_users",
      {
        description:
          "Percorre contas em páginas pequenas, retornando apenas dados básicos para navegação. Use admin_get_user_portfolio com targetUserId explícito para abrir uma carteira.",
        inputSchema: z.object({
          page: z.number().int().min(1).max(50_000).default(1),
          pageSize: z.number().int().min(1).max(50).default(20),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ page, pageSize }) => {
        try {
          const result = await mcpAdminReadService.listUsers(
            claims.sub,
            claims.scope,
            page,
            pageSize,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "admin_search_users",
      {
        description:
          "Localiza contas por nome ou e-mail. Exige pelo menos 2 caracteres e paginação; retorna apenas identificadores e dados básicos da conta.",
        inputSchema: z.object({
          query: z.string().trim().min(2).max(120),
          page: z.number().int().min(1).max(50_000).default(1),
          pageSize: z.number().int().min(1).max(50).default(20),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query, page, pageSize }) => {
        try {
          const result = await mcpAdminReadService.searchUsers(
            claims.sub,
            claims.scope,
            query,
            page,
            pageSize,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "admin_get_user_portfolio",
      {
        description:
          "Consulta a carteira e movimentações da conta identificada explicitamente por targetUserId. Não omita nem substitua o identificador do usuário alvo.",
        inputSchema: z.object({
          targetUserId: z.string().trim().min(1).max(255),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ targetUserId }) => {
        try {
          const result = await mcpAdminReadService.getUserPortfolio(
            claims.sub,
            claims.scope,
            targetUserId,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "admin_get_user_operations",
      {
        description:
          "Consulta a janela limitada de operações, movimentações e eventos recentes de conciliação de uma conta identificada explicitamente por targetUserId. Requer mcp:admin:read e revalida o perfil administrativo; não retorna candidatos nem altera dados.",
        inputSchema: z.object({
          targetUserId: z.string().trim().min(1).max(255),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ targetUserId }) => {
        try {
          const result = await mcpAdminReadService.getUserOperations(
            claims.sub,
            claims.scope,
            targetUserId,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "admin_get_user_financial_snapshot",
      {
        description:
          "Consulta um resumo financeiro de uma conta específica: carteira, objetivos, estratégia de longo prazo, alocação, reserva e revisão mensal. Exige targetUserId explícito e a permissão administrativa de leitura.",
        inputSchema: z.object({
          targetUserId: z.string().trim().min(1).max(255),
          period: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ targetUserId, period }) => {
        try {
          const result = await mcpAdminReadService.getUserFinancialSnapshot(
            claims.sub,
            claims.scope,
            targetUserId,
            period,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
  }
}

export const mcpAdminReadToolsController = new McpAdminReadToolsController();
