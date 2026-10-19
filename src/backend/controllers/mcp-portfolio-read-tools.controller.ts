import type { McpServer } from "@modelcontextprotocol/server";
import { mcpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";
import { toolError } from "@/backend/controllers/mcp-tool-result";
import { z } from "zod";

export class McpPortfolioReadToolsController {
  register(server: McpServer, userId: string, requestId: string) {
    server.registerTool(
      "get_my_portfolio",
      {
        description:
          "Consulta somente a carteira da conta conectada, com posições importadas e manuais e movimentações registradas.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.getMyPortfolio(
            userId,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "list_my_manual_positions",
      {
        description:
          "Lista posições manuais da conta conectada; não inclui dados de outras contas.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.listMyManualPositions(
            userId,
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

export const mcpPortfolioReadToolsController =
  new McpPortfolioReadToolsController();
