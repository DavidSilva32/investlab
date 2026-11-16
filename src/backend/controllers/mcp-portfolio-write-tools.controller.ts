import type { McpServer } from "@modelcontextprotocol/server";
import { mcpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";
import { toolError } from "@/backend/controllers/mcp-tool-result";
import { manualPortfolioPositionInputSchema } from "@/backend/services/manual-portfolio-position.service";
import { z } from "zod";

const updateObjectiveSchema = z.object({
  objectiveId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  purpose: z.enum(["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"]),
  targetAmount: z.number().finite().positive().nullable(),
  monthlyPlannedAmount: z.number().finite().min(0).nullable(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
});
const createObjectiveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  purpose: z.enum(["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"]),
  targetAmount: z
    .number()
    .finite()
    .positive()
    .max(1_000_000_000_000)
    .nullable(),
  monthlyPlannedAmount: z
    .number()
    .finite()
    .min(0)
    .max(1_000_000_000_000)
    .nullable(),
  idempotencyKey: z.string().uuid(),
});
const saveBalanceSchema = z.object({
  objectiveId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/),
  observedOn: z.string().date(),
  idempotencyKey: z.string().uuid(),
});
const deleteObjectiveSchema = z
  .object({
    objectiveId: z.string().uuid(),
    objectiveName: z.string().trim().min(1).max(120),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid(),
    confirmation: z.string().trim().min(1).max(240),
  })
  .superRefine((value, context) => {
    const required = `EXCLUIR OBJETIVO "${value.objectiveName}" [${value.objectiveId}]`;
    if (value.confirmation !== required) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Repita o nome e o identificador do objetivo para confirmar.",
      });
    }
  });
const createManualPositionSchema = manualPortfolioPositionInputSchema.extend({
  idempotencyKey: z.string().uuid(),
});
const updateManualPositionSchema = manualPortfolioPositionInputSchema.extend({
  positionId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
});
const deleteManualPositionSchema = z
  .object({
    positionId: z.string().uuid(),
    positionIdentity: z.string().trim().min(1).max(220),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid(),
    confirmation: z.string().trim().min(1).max(300),
  })
  .superRefine((value, context) => {
    const required = `EXCLUIR POSIÇÃO "${value.positionIdentity}" [${value.positionId}]`;
    if (value.confirmation !== required) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: "Repita a identidade e o identificador da posição.",
      });
    }
  });

export class McpPortfolioWriteToolsController {
  register(server: McpServer, userId: string, requestId: string) {
    server.registerTool(
      "write_create_objective",
      {
        description:
          "Cria um objetivo pessoal ou de longo prazo. Envie os campos de nome, finalidade, meta e aporte planejado, usando null para valores não definidos, e uma chave idempotencyKey UUID. Repetir a mesma chave e os mesmos dados retorna o objetivo criado; reutilizar a chave com outros dados é recusado.",
        inputSchema: createObjectiveSchema,
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          const result = await mcpPortfolioToolsService.createMyObjective(
            userId,
            {
              name: input.name,
              purpose: input.purpose,
              targetAmount: input.targetAmount,
              monthlyPlannedAmount: input.monthlyPlannedAmount,
            },
            input.idempotencyKey,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_update_objective",
      {
        description:
          "Atualiza nome, finalidade, meta e aporte mensal planejado de um objetivo. O saldo e a data observados são gerenciados separadamente. Envie expectedUpdatedAt e idempotencyKey UUID; meta e aporte podem ser null. Reenviar a mesma chave e os mesmos dados retorna o resultado original.",
        inputSchema: updateObjectiveSchema,
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          const result = await mcpPortfolioToolsService.updateMyObjective(
            userId,
            input.objectiveId,
            {
              name: input.name,
              purpose: input.purpose,
              targetAmount: input.targetAmount,
              monthlyPlannedAmount: input.monthlyPlannedAmount,
            },
            input.expectedUpdatedAt,
            input.idempotencyKey,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_delete_objective",
      {
        description:
          "Exclui permanentemente um objetivo pessoal ou de longo prazo e o histórico de saldo observado associado. Posições da carteira não são vinculadas a objetivos e permanecem inalteradas. Nunca chame sem pedido explícito e direto do titular para excluir esse objetivo específico. Envie nome e ID exatos, expectedUpdatedAt, idempotencyKey UUID e confirmation no formato exigido. Reenviar a mesma chave e os mesmos dados retorna o recibo original. A frase de confirmação não prova interação humana.",
        inputSchema: deleteObjectiveSchema,
        annotations: {
          readOnlyHint: false,
          openWorldHint: false,
          destructiveHint: true,
        },
      },
      async (input) => {
        try {
          const result = await mcpPortfolioToolsService.deleteMyObjective(
            userId,
            input.objectiveId,
            input.expectedUpdatedAt,
            input.objectiveName,
            input.confirmation,
            input.idempotencyKey,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_save_observed_balance",
      {
        description:
          "Registra somente o saldo informado e sua data. O objetivo acompanha esse saldo; as posições da carteira permanecem independentes. Reenvie a mesma chave idempotencyKey somente com os mesmos dados para receber a resposta original; use uma nova chave para uma nova atualização. Não aceita identificação de usuário nem altera posições.",
        inputSchema: saveBalanceSchema,
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          const result = await mcpPortfolioToolsService.saveMyObservedBalance(
            userId,
            {
              objectiveId: input.objectiveId,
              amount: input.amount,
              observedOn: input.observedOn,
            },
            input.idempotencyKey,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_create_manual_position",
      {
        description:
          "Cria uma posição informada manualmente. Envie os campos da posição e uma chave idempotencyKey UUID. Repetir a chave com os mesmos dados retorna a posição original; usar a chave com outros dados é recusado.",
        inputSchema: createManualPositionSchema,
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          const { idempotencyKey, ...position } = input;
          const result = await mcpPortfolioToolsService.createMyManualPosition(
            userId,
            position,
            idempotencyKey,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_update_manual_position",
      {
        description:
          "Atualiza uma posição manual da conta conectada. Envie a posição completa, positionId, expectedUpdatedAt obtido na consulta e idempotencyKey UUID. Reenviar a mesma chave e os mesmos dados retorna o resultado original; outra carga com a mesma chave é recusada. Não move a posição entre objetivos.",
        inputSchema: updateManualPositionSchema,
        annotations: { readOnlyHint: false, openWorldHint: false },
      },
      async (input) => {
        try {
          const { positionId, expectedUpdatedAt, idempotencyKey, ...position } =
            input;
          const result = await mcpPortfolioToolsService.updateMyManualPosition(
            userId,
            positionId,
            position,
            expectedUpdatedAt,
            idempotencyKey,
            requestId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return toolError(error);
        }
      },
    );
    server.registerTool(
      "write_delete_manual_position",
      {
        description:
          "Exclui permanentemente uma posição manual ativa; os snapshots históricos permanecem. Nunca chame sem pedido explícito e direto do titular para excluir essa posição específica. Envie identidade exata, ID, expectedUpdatedAt atual, idempotencyKey UUID e confirmation no formato exigido. Reenviar a mesma chave e os mesmos dados retorna o recibo original. A frase de confirmação não prova interação humana.",
        inputSchema: deleteManualPositionSchema,
        annotations: {
          readOnlyHint: false,
          openWorldHint: false,
          destructiveHint: true,
        },
      },
      async (input) => {
        try {
          const result = await mcpPortfolioToolsService.deleteMyManualPosition(
            userId,
            input.positionId,
            input.expectedUpdatedAt,
            input.positionIdentity,
            input.confirmation,
            input.idempotencyKey,
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

export const mcpPortfolioWriteToolsController =
  new McpPortfolioWriteToolsController();
