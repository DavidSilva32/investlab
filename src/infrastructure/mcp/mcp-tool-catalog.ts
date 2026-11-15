export type McpToolDocumentation = {
  name: string;
  description: string;
  input: string;
  output: string;
};

export type McpToolGroupDocumentation = {
  id: string;
  label: string;
  description: string;
  permission: "mcp:read" | "mcp:write" | "mcp:admin:read";
  tools: McpToolDocumentation[];
};

/**
 * User-facing MCP catalog. The registration contract test compares every
 * entry here with the tools actually added to McpServer by the controllers.
 */
export const mcpToolGroups: McpToolGroupDocumentation[] = [
  {
    id: "portfolio",
    label: "Carteira",
    description: "Posições, movimentações e distribuição da conta conectada.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_portfolio",
        description: "Consulta posições e movimentações da conta conectada.",
        input: "Sem parâmetros.",
        output: "Carteira e movimentações disponíveis.",
      },
      {
        name: "list_my_manual_positions",
        description: "Lista as posições manuais da conta conectada.",
        input: "Sem parâmetros.",
        output: "Posições manuais da própria conta.",
      },
      {
        name: "get_my_portfolio_allocation",
        description: "Consulta distribuição e concentração da carteira.",
        input: "Sem parâmetros.",
        output: "Distribuição por ativo, classe, subclasse e geografia.",
      },
    ],
  },
  {
    id: "planning",
    label: "Planejamento",
    description: "Reserva, objetivos e estratégia de longo prazo.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_emergency_reserve",
        description: "Consulta o resumo da Reserva e sua fonte de saldo.",
        input: "Sem parâmetros.",
        output: "Saldo usado, fonte, data, meta e cobertura disponível.",
      },
      {
        name: "get_my_objectives",
        description: "Consulta os objetivos financeiros da conta.",
        input: "Sem parâmetros.",
        output: "Resumo dos objetivos, sem posições detalhadas.",
      },
      {
        name: "get_my_long_term_strategy",
        description: "Consulta a estratégia de longo prazo cadastrada.",
        input: "Sem parâmetros.",
        output: "Composição, alocação, metas e qualidade das datas.",
      },
      {
        name: "simulate_objective_projection",
        description: "Calcula uma simulação com premissas informadas.",
        input:
          "Mode e premissas de saldo ou aporte, horizonte, retornos e inflação.",
        output: "Cenário hipotético; não é previsão nem recomendação.",
      },
    ],
  },
  {
    id: "activity",
    label: "Acompanhamento",
    description: "Revisão mensal e conciliação de operações.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_monthly_portfolio_review",
        description: "Compara o fechamento selecionado com o anterior.",
        input: "period opcional, no formato AAAA-MM.",
        output:
          "Variação patrimonial e limitações; não equivale a rentabilidade.",
      },
      {
        name: "get_my_operations_and_reconciliation",
        description: "Consulta operações, movimentações e eventos recentes.",
        input: "Sem parâmetros.",
        output: "Até 50 itens por categoria, com indicação hasMore.",
      },
    ],
  },
  {
    id: "market",
    label: "Simulação e mercado",
    description: "Consulta limitada de cotações B3.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_b3_market_quotes",
        description: "Consulta cotações informativas de ativos B3.",
        input: "de 1 a 10 códigos B3, como PETR4.",
        output: "Preço e horário observado; sem histórico ou recomendação.",
      },
    ],
  },
  {
    id: "writes",
    label: "Atualização de dados",
    description:
      "Gravações na própria conta, disponíveis somente com autorização mcp:write.",
    permission: "mcp:write",
    tools: [
      {
        name: "write_create_objective",
        description: "Cria um objetivo pessoal ou de longo prazo.",
        input: "Nome, finalidade, meta, aporte e idempotencyKey UUID.",
        output:
          "Objetivo criado; repetir a chave com os mesmos dados é seguro.",
      },
      {
        name: "write_update_objective",
        description: "Atualiza um objetivo da conta conectada.",
        input: "ID, campos atualizados, expectedUpdatedAt e idempotencyKey.",
        output: "Objetivo atualizado; não altera vínculos da Reserva.",
      },
      {
        name: "write_delete_objective",
        description: "Exclui um objetivo após confirmação explícita.",
        input: "Identidade, versão, chave idempotente e confirmação exigida.",
        output: "Recibo da exclusão; posições da carteira permanecem.",
      },
      {
        name: "write_save_observed_balance",
        description:
          "Registra saldo observado e tenta conciliar vínculos atuais.",
        input: "Objetivo, valor, data, CDI opcional e chave idempotente.",
        output: "Saldo registrado; vínculos históricos são preservados.",
      },
      {
        name: "write_create_manual_position",
        description: "Cria uma posição informada manualmente.",
        input: "Campos da posição e idempotencyKey UUID.",
        output: "Posição criada para a própria conta.",
      },
      {
        name: "write_update_manual_position",
        description: "Atualiza uma posição manual da conta conectada.",
        input: "Posição completa, ID, expectedUpdatedAt e idempotencyKey.",
        output: "Posição atualizada; não move vínculos entre objetivos.",
      },
      {
        name: "write_delete_manual_position",
        description: "Exclui uma posição manual após confirmação explícita.",
        input: "Identidade, versão, chave idempotente e confirmação exigida.",
        output: "Posição ativa removida; snapshots históricos são mantidos.",
      },
    ],
  },
  {
    id: "admin",
    label: "Administração",
    description:
      "Leituras administrativas adicionais para contas ADMIN e escopo explícito.",
    permission: "mcp:admin:read",
    tools: [
      {
        name: "admin_list_users",
        description: "Lista contas em páginas para navegação.",
        input: "page e pageSize opcionais.",
        output: "Dados básicos de contas, sem dados financeiros.",
      },
      {
        name: "admin_search_users",
        description: "Localiza contas por nome ou e-mail.",
        input: "query (2 a 120 caracteres), page e pageSize.",
        output: "Dados básicos paginados para identificar a conta.",
      },
      {
        name: "admin_get_user_portfolio",
        description: "Consulta a carteira de uma conta selecionada.",
        input: "targetUserId explícito.",
        output: "Carteira e movimentações da conta escolhida.",
      },
      {
        name: "admin_get_user_operations",
        description: "Consulta operações recentes de uma conta selecionada.",
        input: "targetUserId explícito.",
        output: "Até 50 itens por categoria; sem alterações de dados.",
      },
      {
        name: "admin_get_user_financial_snapshot",
        description: "Consulta um resumo financeiro de uma conta selecionada.",
        input: "targetUserId explícito e period opcional.",
        output: "Resumo para o período disponível.",
      },
    ],
  },
];

export const mcpDocumentedToolNames = mcpToolGroups.flatMap(({ tools }) =>
  tools.map(({ name }) => name),
);

export const mcpCatalogDescription = mcpToolGroups
  .map(
    ({ label, permission, tools }) =>
      `### ${label} (${permission})\n${tools.map(({ name, description }) => `- \`${name}\`: ${description}`).join("\n")}`,
  )
  .join("\n\n");
