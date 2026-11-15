# Referência da API do InvestLab

A referência interativa fica em `/docs/api`; o contrato OpenAPI é servido por `/api/openapi.json`.

O contrato é mantido em `src/infrastructure/api/openapi-document.ts`. Cada operação deve ser confirmada nas Route Handlers, controllers, validações e serviços antes de ser documentada. O recorte inclui carteira, objetivos, revisão mensal, posições manuais e importação/conciliação B3. Outras rotas duráveis, como `/api/positions/reconciliation`, e as rotas de autenticação, administração, tarefas internas, webhooks e análise continuam fora desta referência; a página não representa toda a API pública.

O catálogo MCP vem de `src/infrastructure/mcp/mcp-tool-catalog.ts`. O teste correspondente compara os nomes documentados com os registrados pelos controllers de leitura, escrita e administração. MCP usa OAuth e escopos próprios; não é apresentado como um endpoint REST.

Ao alterar uma rota incluída, atualize a operação e os schemas aqui mantidos, revise o corpo/resposta real do handler e acrescente ou ajuste os testes. A suíte valida o documento com Swagger Parser e verifica que `/docs/api` e `/api/openapi.json` permanecem acessíveis sem sessão, enquanto a API financeira continua protegida.
