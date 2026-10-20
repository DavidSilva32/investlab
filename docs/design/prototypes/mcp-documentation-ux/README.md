# Protótipo da documentação MCP

- **Rota:** `/mcp`.
- **Experiências:** visão geral em linguagem simples e configuração guiada do ChatGPT.
- **Arquivo:** [protótipo navegável](./index.html).
- **Fonte de verdade:** `src/app/(public)/mcp/_components/mcp-documentation.tsx`, `src/app/(public)/mcp/_components/mcp-connection-values.tsx`, `src/infrastructure/mcp/mcp-configuration.ts` e `docs/design/active-route-inventory.md`.
- **Suporte funcional:** o produto atual documenta o ChatGPT, fornece nome/descrição/endereço do servidor, OAuth descoberto automaticamente, download opcional de `public/investlab-logo.png` e catálogo de ferramentas de consulta. Ferramentas administrativas são adicionais e condicionadas à autorização ADMIN. Este protótipo não altera esses fluxos.
- **Proposta:** mover os dados copiáveis e a ação de baixar o ícone para “Conectar ao ChatGPT”; localizar os quatro rótulos; explicar o MCP com três ações curtas; deixar a lista de ferramentas e limites em seções próprias. “Outros assistentes” aparece apenas como estado em avaliação, não como compatibilidade existente.
- **Conteúdo demonstrativo:** o endereço HTTPS é um marcador visual, pois a rota recebe seu endpoint de configuração em runtime. Botão de download é ilustrativo. Não reutilizar os valores demonstrativos como configuração real.
- **Tema e contexto:** desktop em tema claro, identidade azul aprovada, menu lateral compacto. O HTML também reflowa em viewport estreita, mas não foi feita referência visual mobile.
- **Ativos:** usa `public/investlab-logo.png` e a marca oficial existente `public/chatgpt-icon.svg` junto ao guia e item de navegação do ChatGPT; sem imagens geradas.

## Status

- Referência criada: **sim**, HTML navegável criado em 20/10/2026.
- Revisão do contexto funcional: **parcial**; código, fluxo publicado e implementação conferidos, sem validação de outros clientes MCP.
- Layout implementado na rota de produção: **sim**, componentes e testes alterados em 20/10/2026.
- Verificação estrutural: **parcial**; revisão independente não encontrou regressões; lint, formatação e typecheck isolado passaram antes do build. A suíte global final registrou 3.607 testes e 100% em statements, branches, functions e lines. O build Turbopack falhou ao criar subprocesso; a compilação Webpack concluiu, mas o typecheck gerado apontou erros em rotas não alteradas (dashboard, planning, portfolio, consent MCP e screener).
- Comparação visual real: **pendente**; a captura local do branch não foi possível nesta sessão do navegador.
- Aprovação do usuário: **aprovado em 20/10/2026** para implementar esta composição.

O protótipo registra a direção aprovada e o contexto da mudança; não é servido pela rota de produção. A implementação atual está em `src/app/(public)/mcp/_components/`.
