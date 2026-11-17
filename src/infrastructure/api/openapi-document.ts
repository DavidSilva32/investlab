import { mcpCatalogDescription } from "@/infrastructure/mcp/mcp-tool-catalog";
import { mcpDocumentationResource } from "@/infrastructure/mcp/mcp-configuration";

const jsonContent = (schema: Record<string, unknown>) => ({
  "application/json": { schema },
});

const jsonRequest = (schema: Record<string, unknown>) => ({
  required: true,
  content: jsonContent(schema),
});

const response = (description: string, schemaName = "MessageResponse") => ({
  description,
  content: jsonContent({ $ref: `#/components/schemas/${schemaName}` }),
});

const commonErrors = {
  "401": response("Sessão ausente ou inválida."),
  "500": response("Falha interna. O detalhe não é exposto ao cliente."),
};
const validationError = { "400": response("Entrada inválida.") };
const notFoundError = { "404": response("Registro não encontrado.") };
const unprocessableError = {
  "422": response("O arquivo XLSX não possui um formato B3 reconhecido."),
};
const conflictError = {
  "409": response("Conflito com o estado atual dos dados."),
};

const ownerSecurity = [{ BetterAuthSession: [] }];

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "InvestLab API",
    version: "1.0.0",
    description: `
Esta referência cobre um **recorte estável da API REST** para carteira, objetivos, revisão mensal, posições manuais e importação/conciliação B3. A API pública tem outras rotas duráveis fora deste recorte; por exemplo, a rota /api/positions/reconciliation e as APIs de análise ainda não fazem parte desta referência.

### Autenticação REST
Os endpoints REST listados exigem uma sessão InvestLab válida por cookie Better Auth. Uma chamada sem sessão responde status 401. O acesso continua sujeito à autorização e à titularidade dos dados no servidor.

### MCP
O servidor MCP remoto está em [${mcpDocumentationResource}](${mcpDocumentationResource}) e utiliza OAuth 2.0. Conceda somente os escopos necessários: mcp:read consulta dados da própria conta; mcp:write permite criar, atualizar e excluir dados da própria conta; mcp:admin:read disponibiliza leituras administrativas a contas ADMIN.

${mcpCatalogDescription}

Os nomes e descrições acima são comparados em testes com as ferramentas que os controllers MCP realmente registram. MCP é um protocolo próprio, não uma rota REST OpenAPI.
`,
  },
  servers: [{ url: "/", description: "Origem da implantação atual." }],
  tags: [
    { name: "Carteira", description: "Consulta da carteira consolidada." },
    { name: "Objetivos", description: "Metas e saldos observados." },
    {
      name: "Posições manuais",
      description: "Posições informadas pelo titular.",
    },
    {
      name: "Importação B3",
      description: "Prévia, confirmação e gestão de importações B3.",
    },
  ],
  paths: {
    "/api/portfolio": {
      get: {
        tags: ["Carteira"],
        summary: "Consultar carteira consolidada",
        description: "Retorna posições e movimentações da conta autenticada.",
        security: ownerSecurity,
        responses: {
          "200": response("Carteira carregada.", "PortfolioOverview"),
          ...commonErrors,
        },
      },
    },
    "/api/portfolio/objectives": {
      get: {
        tags: ["Objetivos"],
        summary: "Listar objetivos e destinos",
        security: ownerSecurity,
        responses: {
          "200": response("Objetivos carregados.", "ObjectiveOverview"),
          ...commonErrors,
        },
      },
      post: {
        tags: ["Objetivos"],
        summary: "Criar objetivo",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/CreateObjective",
        }),
        responses: {
          "201": response("Objetivo criado.", "ObjectiveRecord"),
          ...commonErrors,
          ...validationError,
        },
      },
      put: {
        tags: ["Objetivos"],
        summary: "Atualizar objetivo",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/UpdateObjective",
        }),
        responses: {
          "200": response("Objetivo atualizado.", "ObjectiveRecord"),
          "404": response("Objetivo não encontrado."),
          ...commonErrors,
          ...validationError,
        },
      },
      delete: {
        tags: ["Objetivos"],
        summary: "Excluir objetivo",
        description:
          "A Reserva não pode ser excluída. A exclusão de outro objetivo também remove seus registros de saldo observado. As posições permanecem na carteira e não são associadas a objetivos.",
        security: ownerSecurity,
        parameters: [
          {
            name: "objectiveId",
            in: "query",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": response("Objetivo excluído."),
          "404": response("Objetivo não encontrado."),
          ...commonErrors,
          ...validationError,
        },
      },
    },
    "/api/portfolio/objectives/balance": {
      put: {
        tags: ["Objetivos"],
        summary: "Salvar saldo observado de um objetivo",
        description:
          "Registra somente o saldo informado e sua data. O objetivo acompanha esse saldo; as posições da carteira permanecem independentes.",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/ObservedBalance",
        }),
        responses: {
          "201": response("Saldo atualizado.", "MessageResponse"),
          ...commonErrors,
          ...validationError,
          ...notFoundError,
        },
      },
    },
    "/api/positions/manual": {
      get: {
        tags: ["Posições manuais"],
        summary: "Listar posições manuais",
        security: ownerSecurity,
        responses: {
          "200": response("Posições carregadas.", "ManualPositionsResponse"),
          ...commonErrors,
        },
      },
      post: {
        tags: ["Posições manuais"],
        summary: "Criar posição manual",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/ManualPositionInput",
        }),
        responses: {
          "201": response("Posição criada.", "ManualPositionResponse"),
          ...commonErrors,
          ...validationError,
        },
      },
      patch: {
        tags: ["Posições manuais"],
        summary: "Atualizar posição manual",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/ManualPositionUpdate",
        }),
        responses: {
          "200": response("Posição atualizada.", "ManualPositionResponse"),
          ...commonErrors,
          ...validationError,
          ...notFoundError,
        },
      },
      delete: {
        tags: ["Posições manuais"],
        summary: "Excluir posição manual",
        description:
          "A solicitação DELETE recebe JSON no corpo com o identificador UUID da posição.",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/ManualPositionDelete",
        }),
        responses: {
          "200": response("Posição removida."),
          ...commonErrors,
          ...validationError,
          ...notFoundError,
        },
      },
    },
    "/api/imports": {
      get: {
        tags: ["Importação B3"],
        summary: "Consultar reconciliações B3",
        security: ownerSecurity,
        responses: {
          "200": response(
            "Resumo de reconciliação carregado.",
            "ImportReconciliationSummary",
          ),
          ...commonErrors,
        },
      },
      delete: {
        tags: ["Importação B3"],
        summary: "Excluir registros ou importações B3",
        description:
          "A exclusão é permanente. Informe documentType; id opcional exclui um único registro elegível, e sem id exclui os itens importados daquele tipo.",
        security: ownerSecurity,
        parameters: [
          {
            name: "documentType",
            in: "query",
            required: true,
            schema: { $ref: "#/components/schemas/B3DocumentType" },
          },
          {
            name: "id",
            in: "query",
            required: false,
            description:
              "Para B3_POSITION_XLSX, identifica posição; para B3_MOVEMENT_XLSX, movimentação não conciliada. B3_TRADING_XLSX com id é rejeitado com 400.",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": response("Itens excluídos.", "ImportDeleteResponse"),
          ...commonErrors,
          ...validationError,
          ...notFoundError,
          ...conflictError,
        },
      },
    },
    "/api/imports/preview": {
      post: {
        tags: ["Importação B3"],
        summary: "Gerar prévia de arquivo XLSX",
        description:
          "O nome deve terminar em .xlsx e o tamanho deve ser maior que zero e até 5 MiB. O MIME informado não é validado. A prévia não altera a carteira.",
        security: ownerSecurity,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          "200": response("Prévia do documento reconhecido.", "ImportPreview"),
          ...commonErrors,
          ...validationError,
          ...unprocessableError,
        },
      },
    },
    "/api/proventos": {
      get: {
        tags: ["Carteira"],
        summary: "Consultar proventos importados da B3",
        description:
          "Retorna os proventos recebidos e previstos. Os totais consideram somente a importação mais recente de cada tipo; os itens preservam o arquivo de origem.",
        security: ownerSecurity,
        responses: {
          "200": response(
            "Proventos e importações mais recentes carregados.",
            "B3ProventosResponse",
          ),
          ...commonErrors,
        },
      },
    },
    "/api/imports/confirm": {
      post: {
        tags: ["Importação B3"],
        summary: "Confirmar importação de arquivo XLSX",
        description:
          "Aceita multipart/form-data. O nome deve terminar em .xlsx e o tamanho deve ser maior que zero e até 5 MiB. O MIME informado não é validado. referenceDate e reconciliationDecisions são campos textuais opcionais; reconciliationDecisions recebe JSON serializado. A confirmação altera dados da conta.",
        security: ownerSecurity,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary" },
                  referenceDate: { type: "string", format: "date" },
                  reconciliationDecisions: {
                    type: "string",
                    description:
                      "JSON serializado com as decisões de conciliação.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": response(
            "Arquivo idêntico revisado sem criar posições duplicadas.",
            "ImportConfirmResponse",
          ),
          "201": response("Importação confirmada.", "ImportConfirmResponse"),
          ...commonErrors,
          ...validationError,
          ...conflictError,
          ...unprocessableError,
        },
      },
    },
    "/api/imports/reconciliation": {
      post: {
        tags: ["Importação B3"],
        summary: "Salvar decisões de conciliação B3",
        description:
          "Persiste vínculos entre negociações e movimentações, ou registra que devem permanecer separadas.",
        security: ownerSecurity,
        requestBody: jsonRequest({
          $ref: "#/components/schemas/ReconciliationDecisions",
        }),
        responses: {
          "200": response(
            "Decisões salvas e resumo atualizado.",
            "ReconciliationDecisionResponse",
          ),
          ...commonErrors,
          ...validationError,
          ...conflictError,
        },
      },
    },
    "/api/portfolio/monthly-review": {
      get: {
        tags: ["Carteira"],
        summary: "Consultar revisão mensal da carteira",
        description:
          "Compara fechamentos mensais disponíveis. A variação observada não equivale a rentabilidade nem separa aportes de rendimentos.",
        security: ownerSecurity,
        parameters: [
          {
            name: "period",
            in: "query",
            required: false,
            description: "Mês no formato AAAA-MM.",
            schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          },
        ],
        responses: {
          "200": response(
            "Revisão mensal carregada.",
            "MonthlyPortfolioReview",
          ),
          ...commonErrors,
          ...validationError,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BetterAuthSession: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description:
          "Sessão Better Auth. Em HTTPS, o cookie usa prefixo seguro. A autorização de titularidade é aplicada no servidor.",
      },
    },
    schemas: {
      MessageResponse: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      Objective: {
        type: "object",
        required: ["id", "updatedAt", "kind", "purpose", "name"],
        properties: {
          id: { type: "string", format: "uuid" },
          updatedAt: { type: "string", format: "date-time" },
          kind: { type: "string", enum: ["RESERVE", "CUSTOM"] },
          purpose: {
            type: "string",
            enum: ["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"],
            nullable: true,
          },
          name: { type: "string" },
          targetAmount: { type: "number", nullable: true },
          targetAmountCents: { type: "string", nullable: true },
          monthlyPlannedAmount: { type: "number", nullable: true },
          monthlyPlannedAmountCents: { type: "string", nullable: true },
          currentValue: { type: "number", nullable: true },
          remainingAmount: { type: "number", nullable: true },
          progressPercent: { type: "number", nullable: true },
          balanceTracking: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/BalanceTracking" }],
          },
        },
      },
      BalanceTracking: {
        type: "object",
        required: ["observedAmountCents", "observedOn"],
        properties: {
          observedAmountCents: { type: "string" },
          observedOn: { type: "string", format: "date" },
        },
      },
      ObjectiveOverview: {
        type: "object",
        required: ["objectives"],
        properties: {
          objectives: {
            type: "array",
            items: { $ref: "#/components/schemas/ObjectiveOverviewItem" },
          },
        },
      },
      CreateObjective: {
        type: "object",
        required: ["name", "purpose"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          purpose: {
            type: "string",
            enum: ["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"],
          },
          targetAmount: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 1000000000000,
            nullable: true,
          },
          monthlyPlannedAmount: {
            type: "number",
            minimum: 0,
            maximum: 1000000000000,
            nullable: true,
          },
        },
      },
      UpdateObjective: {
        type: "object",
        required: ["objectiveId", "name"],
        properties: {
          objectiveId: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 120 },
          purpose: {
            type: "string",
            enum: ["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"],
            nullable: true,
          },
          targetAmount: {
            type: "number",
            exclusiveMinimum: true,
            minimum: 0,
            maximum: 1000000000000,
            nullable: true,
          },
          monthlyPlannedAmount: {
            type: "number",
            minimum: 0,
            maximum: 1000000000000,
            nullable: true,
          },
        },
      },
      ObjectiveRecord: {
        type: "object",
        description:
          "Registro devolvido na criação/atualização; valores monetários do banco são serializados como strings decimais.",
        required: ["id", "kind", "name", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          kind: { type: "string", enum: ["RESERVE", "CUSTOM"] },
          name: { type: "string" },
          purpose: {
            type: "string",
            enum: ["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"],
            nullable: true,
          },
          targetAmount: { type: "string", nullable: true },
          monthlyPlannedAmount: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ObjectiveOverviewItem: {
        type: "object",
        required: [
          "id",
          "kind",
          "name",
          "targetAmount",
          "currentValue",
          "balanceTracking",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          kind: { type: "string", enum: ["RESERVE", "CUSTOM"] },
          purpose: {
            type: "string",
            enum: ["PERSONAL_GOAL", "LONG_TERM_INVESTMENT"],
            nullable: true,
          },
          name: { type: "string" },
          targetAmount: { type: "number", nullable: true },
          monthlyPlannedAmount: { type: "number", nullable: true },
          currentValue: {
            type: "number",
            nullable: true,
            description:
              "Último saldo informado; null enquanto não houver observação.",
          },
          remainingAmount: { type: "number", nullable: true },
          progressPercent: { type: "number", nullable: true },
          balanceTracking: {
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/BalanceTracking" }],
          },
        },
      },
      MonthlyPortfolioReview: {
        type: "object",
        required: [
          "availablePeriods",
          "history",
          "selectedPeriod",
          "untrackedManualPositionCount",
          "status",
          "dateAlignment",
          "compositionCoverage",
          "valuationMethodCoverage",
          "current",
          "previous",
          "observedChangeCents",
          "gapMonths",
          "flowSeparation",
        ],
        properties: {
          availablePeriods: {
            type: "array",
            items: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          },
          history: {
            type: "array",
            items: {
              $ref: "#/components/schemas/MonthlyPortfolioHistoryPoint",
            },
          },
          selectedPeriod: { type: "string", nullable: true },
          untrackedManualPositionCount: { type: "integer" },
          status: {
            type: "string",
            enum: [
              "no_history",
              "missing_snapshot",
              "no_previous_close",
              "insufficient_values",
              "ready",
              "partial",
            ],
          },
          dateAlignment: {
            type: "string",
            enum: ["aligned", "different_dates", "outdated", "unavailable"],
          },
          compositionCoverage: {
            type: "string",
            enum: ["equivalent", "changed", "unknown"],
          },
          valuationMethodCoverage: {
            type: "string",
            enum: ["equivalent", "changed", "unknown"],
          },
          current: {
            allOf: [
              { $ref: "#/components/schemas/MonthlyPortfolioSnapshotSummary" },
            ],
            nullable: true,
          },
          previous: {
            allOf: [
              { $ref: "#/components/schemas/MonthlyPortfolioSnapshotSummary" },
            ],
            nullable: true,
          },
          observedChangeCents: { type: "string", nullable: true },
          gapMonths: { type: "integer" },
          flowSeparation: {
            type: "object",
            required: ["status", "explanation"],
            properties: {
              status: { type: "string", enum: ["unavailable"] },
              explanation: { type: "string" },
            },
          },
        },
      },
      MonthlyPortfolioHistoryPoint: {
        type: "object",
        required: ["period", "summary", "completeness"],
        properties: {
          period: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
          summary: {
            $ref: "#/components/schemas/MonthlyPortfolioSnapshotSummary",
          },
          completeness: { type: "string", enum: ["complete", "partial"] },
        },
      },
      MonthlyPortfolioSnapshotSummary: {
        type: "object",
        required: [
          "referenceDate",
          "importedAt",
          "sources",
          "sourceReferences",
          "positionCount",
          "valuedPositionCount",
          "unvaluedPositionCount",
          "knownValueCents",
          "valuationMethods",
          "manualPositionDates",
          "manualConversionDates",
          "valuationReferenceDates",
        ],
        properties: {
          referenceDate: { type: "string", format: "date" },
          importedAt: { type: "string", format: "date-time" },
          sources: { type: "array", items: { type: "string" } },
          sourceReferences: {
            type: "array",
            items: {
              type: "object",
              required: ["source", "referenceDate"],
              properties: {
                source: { type: "string" },
                referenceDate: { type: "string", format: "date" },
                recordedAt: { type: "string", format: "date-time" },
                importedAt: { type: "string", format: "date-time" },
              },
            },
          },
          positionCount: { type: "integer" },
          valuedPositionCount: { type: "integer" },
          unvaluedPositionCount: { type: "integer" },
          knownValueCents: { type: "string", nullable: true },
          valuationMethods: { type: "array", items: { type: "string" } },
          manualPositionDates: {
            type: "array",
            items: { type: "string", format: "date" },
          },
          manualConversionDates: {
            type: "array",
            items: { type: "string", format: "date" },
          },
          valuationReferenceDates: {
            type: "array",
            items: { type: "string", format: "date" },
          },
        },
      },
      ObservedBalance: {
        type: "object",
        required: ["objectiveId", "amount", "observedOn"],
        properties: {
          objectiveId: { type: "string", format: "uuid" },
          amount: {
            type: "string",
            pattern: "^\\d+(?:\\.\\d+)?$",
            description:
              "Valor decimal entre 0 e R$ 1 trilhão, sem separador de milhar.",
          },
          observedOn: {
            type: "string",
            format: "date",
            description: "Data de referência, não pode estar no futuro.",
          },
        },
      },
      ManualPositionInput: {
        type: "object",
        required: [
          "product",
          "quantity",
          "currency",
          "valueBasis",
          "positionDate",
        ],
        properties: {
          product: { type: "string", minLength: 1, maxLength: 160 },
          assetCode: { type: "string", maxLength: 24, nullable: true },
          assetClass: {
            type: "string",
            enum: [
              "Renda fixa",
              "Renda variável",
              "Fundos",
              "Criptoativos",
              "Imóveis",
              "Outros",
            ],
            nullable: true,
          },
          subClass: { type: "string", maxLength: 120, nullable: true },
          geography: {
            type: "string",
            enum: ["Brasil", "Exterior", "Global"],
            nullable: true,
          },
          institution: { type: "string", maxLength: 160, nullable: true },
          quantity: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 1000000000000,
          },
          currency: { type: "string", pattern: "^[A-Z]{3}$" },
          valueBasis: { type: "string", enum: ["unit_price", "total_value"] },
          unitPrice: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 1000000000000,
            nullable: true,
            description: "Obrigatório quando valueBasis é unit_price.",
          },
          totalValue: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 1000000000000,
            nullable: true,
            description: "Obrigatório quando valueBasis é total_value.",
          },
          positionDate: { type: "string", format: "date" },
          convertedValueBrl: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 1000000000000,
            nullable: true,
            description:
              "Opcional; se informado, exige conversionDate e currency diferente de BRL.",
          },
          conversionDate: { type: "string", format: "date", nullable: true },
          informationalCdiPercentage: {
            type: "number",
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 9999.9999,
            nullable: true,
            description:
              "Permitido somente para produto cujo nome começa com CDB.",
          },
        },
      },
      ManualPositionUpdate: {
        allOf: [
          { $ref: "#/components/schemas/ManualPositionInput" },
          {
            type: "object",
            required: ["id"],
            properties: { id: { type: "string", format: "uuid" } },
          },
        ],
      },
      ManualPositionDelete: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string", format: "uuid" } },
      },
      ManualPositionsResponse: {
        type: "object",
        required: ["positions"],
        properties: {
          positions: {
            type: "array",
            items: { $ref: "#/components/schemas/ManualPosition" },
          },
        },
      },
      ManualPositionResponse: {
        type: "object",
        required: ["position"],
        properties: {
          position: { $ref: "#/components/schemas/ManualPosition" },
        },
      },
      ManualPosition: {
        type: "object",
        required: [
          "id",
          "assetKey",
          "source",
          "product",
          "quantity",
          "currency",
          "positionDate",
          "lastUpdatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          assetKey: { type: "string" },
          source: { type: "string", enum: ["MANUAL"] },
          product: { type: "string" },
          instrumentKind: {
            type: "string",
            enum: [
              "EQUITY",
              "FII",
              "ETF",
              "FIXED_INCOME",
              "INVESTMENT_FUND",
              "UNKNOWN",
            ],
          },
          assetCode: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          totalValue: { type: "string", nullable: true },
          reportedTotalValue: { type: "string", nullable: true },
          currency: { type: "string" },
          valueBasis: { type: "string", enum: ["unit_price", "total_value"] },
          positionDate: { type: "string", format: "date" },
          convertedValueBrl: { type: "string", nullable: true },
          conversionDate: { type: "string", format: "date", nullable: true },
          informationalCdiPercentage: { type: "string", nullable: true },
          classification: {
            type: "object",
            properties: {
              assetClass: { type: "string", nullable: true },
              subClass: { type: "string", nullable: true },
              geography: { type: "string", nullable: true },
            },
          },
          duplicateAssetCode: { type: "boolean" },
          lastUpdatedAt: { type: "string", format: "date-time" },
        },
      },
      ImportReconciliationSummary: {
        type: "object",
        required: [
          "candidates",
          "confirmed",
          "ambiguous",
          "separated",
          "unmatched",
          "duplicateCandidates",
          "movementDuplicateCandidates",
          "history",
        ],
        properties: {
          candidates: {
            type: "array",
            items: { $ref: "#/components/schemas/ReconciliationCandidate" },
          },
          confirmed: {
            type: "array",
            items: { $ref: "#/components/schemas/ReconciliationPair" },
          },
          ambiguous: {
            type: "array",
            items: { $ref: "#/components/schemas/AmbiguousReconciliation" },
          },
          separated: {
            type: "array",
            items: { $ref: "#/components/schemas/ReconciliationPair" },
          },
          unmatched: {
            type: "array",
            items: { $ref: "#/components/schemas/UnmatchedTrade" },
          },
          duplicateCandidates: {
            type: "array",
            items: { $ref: "#/components/schemas/DuplicateCandidate" },
          },
          movementDuplicateCandidates: {
            type: "array",
            items: { $ref: "#/components/schemas/MovementDuplicateCandidate" },
          },
          history: {
            type: "object",
            required: ["complete", "reasons"],
            properties: {
              complete: { type: "boolean" },
              reasons: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      ReconciliationDecisions: {
        type: "object",
        additionalProperties: false,
        required: ["decisions"],
        properties: {
          decisions: {
            type: "array",
            minItems: 1,
            maxItems: 1000,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tradeId", "movementId", "action"],
              properties: {
                tradeId: { type: "string", format: "uuid" },
                movementId: { type: "string", format: "uuid" },
                action: { type: "string", enum: ["LINK", "KEEP_SEPARATE"] },
              },
            },
          },
        },
      },
      ReconciliationDecisionResponse: {
        allOf: [
          { $ref: "#/components/schemas/ImportReconciliationSummary" },
          {
            type: "object",
            required: ["message"],
            properties: { message: { type: "string" } },
          },
        ],
      },
      ReconciliationTrade: {
        type: "object",
        required: ["sourceRow", "date", "side", "product", "quantity"],
        properties: {
          sourceRow: { type: "integer" },
          date: { type: "string", format: "date" },
          side: { type: "string", enum: ["BUY", "SELL"] },
          ticker: { type: "string", nullable: true },
          originalTicker: { type: "string", nullable: true },
          product: { type: "string" },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          value: { type: "string", nullable: true },
        },
      },
      ReconciliationMovement: {
        type: "object",
        required: ["date", "direction", "movementType", "product", "quantity"],
        properties: {
          sourceRow: { type: "integer", nullable: true },
          date: { type: "string", format: "date" },
          direction: { type: "string" },
          movementType: { type: "string" },
          ticker: { type: "string", nullable: true },
          originalTicker: { type: "string", nullable: true },
          product: { type: "string" },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          value: { type: "string", nullable: true },
        },
      },
      ReconciliationPair: {
        type: "object",
        required: [
          "tradeId",
          "movementId",
          "trade",
          "movement",
          "valueDifferenceCents",
          "valueComparison",
        ],
        properties: {
          tradeId: { type: "string", format: "uuid" },
          movementId: { type: "string", format: "uuid" },
          trade: { $ref: "#/components/schemas/ReconciliationTrade" },
          movement: { $ref: "#/components/schemas/ReconciliationMovement" },
          valueDifferenceCents: { type: "string", nullable: true },
          valueComparison: {
            type: "string",
            enum: ["equal", "different", "unavailable"],
          },
        },
      },
      ReconciliationCandidate: {
        allOf: [
          { $ref: "#/components/schemas/ReconciliationPair" },
          {
            type: "object",
            required: ["status"],
            properties: { status: { type: "string", enum: ["candidate"] } },
          },
        ],
      },
      AmbiguousReconciliation: {
        type: "object",
        required: ["tradeId", "movementIds", "pairs", "status"],
        properties: {
          tradeId: { type: "string", format: "uuid" },
          movementIds: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          pairs: {
            type: "array",
            items: { $ref: "#/components/schemas/ReconciliationPair" },
          },
          status: { type: "string", enum: ["ambiguous"] },
        },
      },
      UnmatchedTrade: {
        type: "object",
        required: ["tradeId", "trade", "reason"],
        properties: {
          tradeId: { type: "string", format: "uuid" },
          trade: { $ref: "#/components/schemas/ReconciliationTrade" },
          reason: { type: "string" },
        },
      },
      DuplicateCandidate: {
        type: "object",
        required: [
          "identityFingerprint",
          "occurrenceCount",
          "sourceRows",
          "importCount",
          "status",
        ],
        properties: {
          identityFingerprint: { type: "string" },
          occurrenceCount: { type: "integer" },
          sourceRows: { type: "array", items: { type: "integer" } },
          importCount: { type: "integer" },
          status: { type: "string", enum: ["ambiguous"] },
        },
      },
      MovementDuplicateCandidate: {
        type: "object",
        required: [
          "eventFingerprint",
          "occurrenceCount",
          "sourceRows",
          "importCount",
          "status",
        ],
        properties: {
          eventFingerprint: { type: "string" },
          occurrenceCount: { type: "integer" },
          sourceRows: { type: "array", items: { type: "integer" } },
          importCount: { type: "integer" },
          status: { type: "string", enum: ["ambiguous"] },
        },
      },
      ImportPreview: {
        oneOf: [
          { $ref: "#/components/schemas/B3PositionImportPreview" },
          { $ref: "#/components/schemas/B3MovementImportPreview" },
          { $ref: "#/components/schemas/B3TradingImportPreview" },
          { $ref: "#/components/schemas/B3ProventoImportPreview" },
        ],
        discriminator: {
          propertyName: "documentType",
          mapping: {
            B3_POSITION_XLSX: "#/components/schemas/B3PositionImportPreview",
            B3_MOVEMENT_XLSX: "#/components/schemas/B3MovementImportPreview",
            B3_TRADING_XLSX: "#/components/schemas/B3TradingImportPreview",
            B3_PROVENTO_XLSX: "#/components/schemas/B3ProventoImportPreview",
          },
        },
        description:
          "A prévia discrimina posição, movimentação, negociação e proventos. Proventos recebidos e previstos ficam separados da carteira e não registram operações.",
      },
      B3ProventoImportPreview: {
        type: "object",
        required: [
          "documentType",
          "hash",
          "count",
          "proventos",
          "duplicateImport",
        ],
        properties: {
          documentType: { type: "string", enum: ["B3_PROVENTO_XLSX"] },
          hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          count: { type: "integer", minimum: 0 },
          duplicateImport: { type: "boolean" },
          proventos: {
            type: "array",
            items: { $ref: "#/components/schemas/B3ProventoPreviewItem" },
          },
        },
      },
      B3ProventosResponse: {
        type: "object",
        required: ["items", "latestImports"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/B3ProventoItem" },
          },
          latestImports: {
            type: "object",
            required: ["received", "upcoming"],
            properties: {
              received: {
                nullable: true,
                allOf: [
                  { $ref: "#/components/schemas/B3ProventoLatestImport" },
                ],
              },
              upcoming: {
                nullable: true,
                allOf: [
                  { $ref: "#/components/schemas/B3ProventoLatestImport" },
                ],
              },
            },
          },
        },
      },
      B3ProventoLatestImport: {
        type: "object",
        required: ["fileName", "importedAt", "count", "total"],
        properties: {
          fileName: { type: "string" },
          importedAt: { type: "string", format: "date-time" },
          count: { type: "integer", minimum: 0 },
          total: { type: "number", minimum: 0 },
        },
      },
      B3ProventoPreviewItem: {
        type: "object",
        required: [
          "status",
          "sourceSheet",
          "sourceRow",
          "product",
          "eventType",
          "paymentDate",
          "institution",
          "quantity",
          "unitPrice",
          "netValue",
        ],
        properties: {
          status: { type: "string", enum: ["RECEIVED", "UPCOMING"] },
          sourceSheet: { type: "string" },
          sourceRow: { type: "integer", minimum: 1 },
          product: { type: "string" },
          eventType: { type: "string" },
          paymentDate: { type: "string", format: "date" },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string" },
          netValue: { type: "string" },
        },
      },
      B3ProventoItem: {
        type: "object",
        required: [
          "id",
          "importId",
          "fileName",
          "status",
          "sourceSheet",
          "sourceRow",
          "product",
          "eventType",
          "paymentDate",
          "institution",
          "quantity",
          "unitPrice",
          "netValue",
          "importedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          importId: { type: "string", format: "uuid" },
          fileName: { type: "string" },
          status: { type: "string", enum: ["RECEIVED", "UPCOMING"] },
          sourceSheet: { type: "string" },
          sourceRow: { type: "integer", minimum: 1 },
          product: { type: "string" },
          eventType: { type: "string" },
          paymentDate: { type: "string", format: "date" },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string" },
          netValue: { type: "string" },
          importedAt: { type: "string", format: "date-time" },
        },
      },
      B3PositionImportPreview: {
        type: "object",
        required: [
          "documentType",
          "hash",
          "count",
          "positions",
          "latestPositionReferenceDate",
          "reconciliationCandidates",
        ],
        properties: {
          documentType: { type: "string", enum: ["B3_POSITION_XLSX"] },
          hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          count: { type: "integer", minimum: 0 },
          positions: {
            type: "array",
            items: { $ref: "#/components/schemas/B3Position" },
          },
          latestPositionReferenceDate: {
            type: "string",
            format: "date",
            nullable: true,
          },
          reconciliationCandidates: {
            type: "array",
            items: {
              $ref: "#/components/schemas/PositionReconciliationCandidate",
            },
          },
          duplicateImportMessage: { type: "string" },
          existingReferenceDate: {
            type: "string",
            format: "date",
            nullable: true,
          },
          referenceDateNeedsSelection: { type: "boolean" },
          referenceDateConflict: { type: "boolean" },
        },
      },
      B3MovementImportPreview: {
        type: "object",
        required: ["documentType", "hash", "count", "movements"],
        properties: {
          documentType: { type: "string", enum: ["B3_MOVEMENT_XLSX"] },
          hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          count: { type: "integer", minimum: 0 },
          movements: {
            type: "array",
            items: { $ref: "#/components/schemas/B3MovementImportItem" },
          },
        },
      },
      B3TradingImportPreview: {
        type: "object",
        required: [
          "documentType",
          "hash",
          "count",
          "trades",
          "history",
          "duplicateCandidates",
          "reconciliation",
          "batchReconciliationPending",
        ],
        properties: {
          documentType: { type: "string", enum: ["B3_TRADING_XLSX"] },
          hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
          count: { type: "integer", minimum: 0 },
          trades: {
            type: "array",
            items: { $ref: "#/components/schemas/B3Trade" },
          },
          history: { $ref: "#/components/schemas/ImportHistory" },
          duplicateCandidates: {
            type: "array",
            items: { $ref: "#/components/schemas/DuplicateCandidate" },
          },
          reconciliation: {
            type: "object",
            required: ["candidates", "confirmed", "ambiguous", "unmatched"],
            properties: {
              candidates: {
                type: "array",
                items: { $ref: "#/components/schemas/ReconciliationCandidate" },
              },
              confirmed: {
                type: "array",
                items: { $ref: "#/components/schemas/ReconciliationPair" },
              },
              ambiguous: {
                type: "array",
                items: { $ref: "#/components/schemas/AmbiguousReconciliation" },
              },
              unmatched: {
                type: "array",
                items: { $ref: "#/components/schemas/UnmatchedTrade" },
              },
            },
          },
          batchReconciliationPending: { type: "boolean", enum: [true] },
        },
      },
      B3Position: {
        type: "object",
        required: [
          "sourceSheet",
          "sourceRow",
          "instrumentKind",
          "product",
          "quantity",
        ],
        properties: {
          sourceSheet: { type: "string" },
          sourceRow: { type: "integer" },
          instrumentKind: { type: "string" },
          product: { type: "string" },
          institution: { type: "string", nullable: true },
          account: { type: "string", nullable: true },
          issuer: { type: "string", nullable: true },
          issuerCnpj: { type: "string", nullable: true },
          sourceType: { type: "string", nullable: true },
          assetCode: { type: "string", nullable: true },
          originalAssetCode: { type: "string", nullable: true },
          isin: { type: "string", nullable: true },
          indexer: { type: "string", nullable: true },
          regimeType: { type: "string", nullable: true },
          issuedAt: { type: "string", format: "date", nullable: true },
          maturityAt: { type: "string", format: "date", nullable: true },
          quantity: { type: "string" },
          availableQuantity: { type: "string", nullable: true },
          unavailableQuantity: { type: "string", nullable: true },
          unitPrice: { type: "string", nullable: true },
          totalValue: { type: "string", nullable: true },
          valuationSource: {
            type: "string",
            enum: ["MTM", "CURVA", "FECHAMENTO", "INFORMADO"],
            nullable: true,
          },
          mtmUnitPrice: { type: "string", nullable: true },
          mtmTotalValue: { type: "string", nullable: true },
          curveUnitPrice: { type: "string", nullable: true },
          curveTotalValue: { type: "string", nullable: true },
          closingUnitPrice: { type: "string", nullable: true },
          closingTotalValue: { type: "string", nullable: true },
        },
      },
      B3MovementImportItem: {
        type: "object",
        required: [
          "sourceRow",
          "direction",
          "occurredAt",
          "movementType",
          "product",
          "quantity",
        ],
        properties: {
          sourceRow: { type: "integer" },
          direction: { type: "string", enum: ["CREDITO", "DEBITO"] },
          occurredAt: { type: "string", format: "date" },
          movementType: { type: "string" },
          product: { type: "string" },
          assetCode: { type: "string", nullable: true },
          originalAssetCode: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          operationValue: { type: "string", nullable: true },
        },
      },
      B3Trade: {
        type: "object",
        required: [
          "side",
          "tradingDate",
          "settlementDate",
          "movementType",
          "product",
          "quantity",
          "fees",
          "sourceRow",
        ],
        properties: {
          side: { type: "string", enum: ["BUY", "SELL"] },
          tradingDate: { type: "string", format: "date" },
          settlementDate: { type: "string", nullable: true },
          movementType: { type: "string" },
          market: { type: "string", nullable: true },
          product: { type: "string" },
          assetCode: { type: "string", nullable: true },
          originalAssetCode: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          grossValue: { type: "string", nullable: true },
          fees: { type: "string", nullable: true },
          sourceRow: { type: "integer" },
        },
      },
      PositionReconciliationCandidate: {
        type: "object",
        required: [
          "manualAssetKey",
          "importedAssetKey",
          "status",
          "manualProduct",
          "importedProduct",
          "reasons",
        ],
        properties: {
          manualAssetKey: { type: "string" },
          importedAssetKey: { type: "string" },
          status: { type: "string", enum: ["probable", "conflict"] },
          manualUpdatedAt: { type: "string" },
          manualProduct: { type: "string" },
          importedProduct: { type: "string" },
          manualAssetCode: { type: "string", nullable: true },
          importedAssetCode: { type: "string", nullable: true },
          manualInstitution: { type: "string", nullable: true },
          manualValue: { type: "string", nullable: true },
          importedValue: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          valueDifferenceCents: { type: "string", nullable: true },
          closestValue: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      ImportHistory: {
        type: "object",
        required: ["complete", "reasons"],
        properties: {
          complete: { type: "boolean" },
          reasons: { type: "array", items: { type: "string" } },
        },
      },
      ImportConfirmResponse: {
        type: "object",
        required: ["importId", "count", "documentType", "message"],
        properties: {
          importId: { type: "string", format: "uuid" },
          count: { type: "integer", minimum: 0 },
          documentType: { $ref: "#/components/schemas/B3DocumentType" },
          message: { type: "string" },
          enrichedPositionCount: { type: "integer", minimum: 0 },
        },
      },
      ImportDeleteResponse: {
        type: "object",
        oneOf: [
          { $ref: "#/components/schemas/DeletedImportCollection" },
          { $ref: "#/components/schemas/DeletedImportItem" },
        ],
        description:
          "Exclusão coletiva retorna deletedImports; exclusão de item retorna message.",
      },
      DeletedImportCollection: {
        type: "object",
        required: ["deletedImports"],
        properties: { deletedImports: { type: "integer", minimum: 0 } },
      },
      DeletedImportItem: {
        type: "object",
        required: ["message"],
        properties: { message: { type: "string" } },
      },
      B3DocumentType: {
        type: "string",
        enum: [
          "B3_POSITION_XLSX",
          "B3_MOVEMENT_XLSX",
          "B3_TRADING_XLSX",
          "B3_PROVENTO_XLSX",
        ],
      },
      PortfolioOverview: {
        type: "object",
        required: [
          "positions",
          "insights",
          "valuationDate",
          "movements",
          "referenceRates",
          "nextContributionGuidance",
          "contributionAllocationMode",
        ],
        properties: {
          positions: {
            type: "array",
            items: { $ref: "#/components/schemas/PortfolioPosition" },
          },
          insights: { $ref: "#/components/schemas/PortfolioInsights" },
          valuationDate: { type: "string", format: "date" },
          movements: {
            type: "array",
            items: { $ref: "#/components/schemas/B3Movement" },
          },
          referenceRates: {
            type: "object",
            required: ["selic", "cdi", "ipca"],
            properties: {
              selic: {
                $ref: "#/components/schemas/ReferenceRate",
                nullable: true,
              },
              cdi: {
                $ref: "#/components/schemas/ReferenceRate",
                nullable: true,
              },
              ipca: {
                $ref: "#/components/schemas/InflationRate",
                nullable: true,
              },
            },
          },
          emergencyReserve: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
          nextContributionGuidance: {
            type: "object",
            required: ["status", "title", "explanation"],
            properties: {
              status: {
                type: "string",
                enum: [
                  "reserve_below_target",
                  "reserve_incomplete",
                  "target_gap",
                  "no_gap",
                  "needs_targets",
                  "needs_values",
                  "incomplete_data",
                  "tie",
                  "unavailable",
                ],
              },
              title: { type: "string" },
              explanation: { type: "string" },
              assetClass: { type: "string" },
              currentPercentage: { type: "number" },
              targetPercentage: { type: "number" },
              reserveNote: { type: "string" },
              allocationMode: { type: "string", enum: ["legacy", "strategy"] },
            },
            additionalProperties: true,
          },
          contributionAllocationMode: {
            type: "string",
            enum: ["legacy", "strategy", "unavailable"],
          },
        },
      },
      PortfolioPosition: {
        type: "object",
        required: ["assetKey", "product", "source", "quantity", "currency"],
        properties: {
          assetKey: { type: "string" },
          product: { type: "string" },
          source: { type: "string", enum: ["B3", "MANUAL"] },
          assetCode: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          currency: { type: "string" },
          totalValue: { type: "string", nullable: true },
          estimatedValue: { type: "number", nullable: true },
          canonicalValueCents: { type: "string", nullable: true },
          canonicalValueSource: { type: "string" },
          referenceDate: { type: "string", format: "date", nullable: true },
          classification: { type: "object", additionalProperties: true },
        },
        additionalProperties: true,
      },
      PortfolioInsights: {
        type: "object",
        required: [
          "totalValue",
          "totalValueCents",
          "valuedPositions",
          "unvaluedPositions",
          "provisionalEstimates",
          "unavailableEstimates",
          "institutions",
          "largestPosition",
          "allocations",
          "chartAllocations",
          "topPositions",
          "upcomingMaturities",
        ],
        properties: {
          totalValue: { type: "number" },
          totalValueCents: { type: "string" },
          valuedPositions: { type: "integer" },
          unvaluedPositions: { type: "integer" },
          provisionalEstimates: { type: "integer" },
          unavailableEstimates: { type: "integer" },
          institutions: { type: "integer" },
          largestPosition: {
            type: "object",
            nullable: true,
            additionalProperties: true,
          },
          allocations: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          chartAllocations: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          topPositions: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
          upcomingMaturities: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
      B3Movement: {
        type: "object",
        required: [
          "id",
          "occurredAt",
          "direction",
          "movementType",
          "product",
          "quantity",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          occurredAt: { type: "string", format: "date" },
          direction: { type: "string" },
          movementType: { type: "string" },
          product: { type: "string" },
          assetCode: { type: "string", nullable: true },
          originalAssetCode: { type: "string", nullable: true },
          institution: { type: "string", nullable: true },
          quantity: { type: "string" },
          unitPrice: { type: "string", nullable: true },
          operationValue: { type: "string", nullable: true },
        },
      },
      ReferenceRate: {
        type: "object",
        required: ["annualRate", "date"],
        properties: {
          annualRate: { type: "string" },
          date: { type: "string", format: "date" },
        },
      },
      InflationRate: {
        type: "object",
        required: ["monthlyRate", "rollingAnnualRate", "date"],
        properties: {
          monthlyRate: { type: "string" },
          rollingAnnualRate: { type: "string" },
          date: { type: "string", format: "date" },
        },
      },
    },
  },
} as const;
