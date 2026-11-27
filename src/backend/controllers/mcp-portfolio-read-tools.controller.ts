import type { McpServer } from "@modelcontextprotocol/server";
import { mcpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";
import { toolError } from "@/backend/controllers/mcp-tool-result";
import { objectiveProjectionInputSchema } from "@/lib/objective-projection";
import { z } from "zod";

export class McpPortfolioReadToolsController {
  register(server: McpServer, userId: string, requestId: string) {
    server.registerTool(
      "get_my_financial_summary",
      {
        description:
          "Consulta o resumo realizado de Finanças da conta conectada em um mês. O resultado do período não é saldo bancário; previsões ficam separadas.",
        inputSchema: z.object({
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ month } = {}) => {
        try {
          const result = await mcpPortfolioToolsService.getMyFinancialSummary(
            userId,
            month,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "list_my_financial_entries",
      {
        description:
          "Lista lançamentos previstos e realizados da conta conectada por mês, com paginação e filtros opcionais por tipo ou nome de categoria. Lançamentos de cartão não são incluídos.",
        inputSchema: z.object({
          month: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
          page: z.number().int().min(1).max(50_000).default(1),
          pageSize: z.number().int().min(1).max(50).default(25),
          kind: z.enum(["INCOME", "EXPENSE"]).optional(),
          category: z.string().trim().min(1).max(80).optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ month, page, pageSize, kind, category }) => {
        try {
          const result = await mcpPortfolioToolsService.listMyFinancialEntries(
            userId,
            { month, page, pageSize, kind, category },
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
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
    server.registerTool(
      "get_my_emergency_reserve",
      {
        description:
          "Consulta a Reserva com o saldo informado mais recente e sua data, além da meta baseada em despesas mensais. Posições da carteira são independentes e não são atribuídas à Reserva.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.getMyEmergencyReserve(
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
      "get_my_objectives",
      {
        description:
          "Consulta objetivos financeiros. Cada objetivo mostra o saldo informado mais recente, sua data, meta e progresso; sem observação, currentValue é null. Objetivos não agrupam posições, e seus saldos não são somados ao patrimônio da carteira.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.getMyObjectives(
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
      "get_my_long_term_strategy",
      {
        description:
          "Consulta a estratégia aplicada à carteira inteira, incluindo patrimônio classificado, alocação, metas e qualidade das datas de avaliação. Não infere a finalidade de ativos a partir dos objetivos nem atribui posições a objetivos.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.getMyLongTermStrategy(
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
      "get_my_portfolio_allocation",
      {
        description:
          "Consulta a distribuição e concentração da carteira por ativo, classe, subclasse e geografia, junto das metas de alocação. Não retorna posição por posição.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result =
            await mcpPortfolioToolsService.getMyPortfolioAllocation(
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
      "get_my_monthly_portfolio_review",
      {
        description:
          "Consulta a revisão mensal da carteira, comparando o fechamento selecionado com o anterior e indicando alinhamento, cobertura e limitações. Sem período, usa o fechamento mais recente disponível.",
        inputSchema: z.object({
          period: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .optional(),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ period } = {}) => {
        try {
          const result =
            await mcpPortfolioToolsService.getMyMonthlyPortfolioReview(
              userId,
              period,
              requestId,
            );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "get_my_operations_and_reconciliation",
      {
        description:
          "Consulta a janela recente de operações manuais, movimentações B3 e eventos de conciliação da conta conectada. Retorna até 50 por categoria, em ordem decrescente por data efetiva da operação, data da movimentação ou ordem do evento, com desempate estável e hasMore. Os eventos não indicam necessariamente o estado atual dos vínculos; a ferramenta não calcula candidatos nem altera dados.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        try {
          const result = await mcpPortfolioToolsService.getMyOperations(
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
      "simulate_objective_projection",
      {
        description:
          "Calcula uma simulação hipotética de saldo futuro ou contribuição mensal necessária usando as premissas fornecidas. Não lê nem altera dados da carteira, não é previsão nem recomendação financeira.",
        inputSchema: objectiveProjectionInputSchema,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => {
        try {
          const result =
            await mcpPortfolioToolsService.simulateMyObjectiveProjection(
              userId,
              input,
            );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "get_b3_market_quotes",
      {
        description:
          "Consulta cotações informativas de até 10 ativos B3. Usa a fonte de mercado conectada ao InvestLab e retorna nome, preço e horário observado; pode retornar ativos indisponíveis. Não fornece histórico, fundamentos, recomendação ou preço em tempo real.",
        inputSchema: z.object({
          tickers: z
            .array(
              z
                .string()
                .trim()
                .toUpperCase()
                .regex(/^[A-Z]{4}[0-9]{1,2}$/, "Informe um ticker B3 válido."),
            )
            .min(1)
            .max(10),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ tickers }) => {
        try {
          const result = await mcpPortfolioToolsService.getMarketQuotes(
            tickers,
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
