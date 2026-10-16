# InvestLab

InvestLab é uma aplicação Next.js para acompanhar uma carteira pessoal e analisar empresas com fontes e critérios explícitos. O produto organiza patrimônio importado, objetivos e destinos, aportes e dados de empresas sem transformar indicadores isolados em recomendações de compra ou venda.

## Arquitetura

A aplicação é um monólito Next.js com UI, Route Handlers, lógica de negócio e persistência no mesmo deploy:

```text
Route Handler → Controller → Service → Repository → Database
```

O PostgreSQL usa Neon e Drizzle. A interface fica em `src/app` e `src/components`; backend e integrações ficam em `src/backend`; infraestrutura transversal fica em `src/infrastructure`.

## Executar localmente

Requer Node.js e pnpm. Copie `.env.example` para `.env`, preencha as variáveis necessárias e execute:

```bash
pnpm install
pnpm dev
```

A aplicação fica em `http://localhost:3000`.

Para gerar o hash da senha localmente:

```bash
node scripts/hash-password.mjs "MINHA_SENHA"
```

Mantenha `AUTH_SECRET` (mínimo de 32 caracteres), `BETTER_AUTH_URL`, `DATABASE_URL_POOLED` e `DATABASE_URL`. Durante a transição da conta única, `AUTH_EMAIL` e `AUTH_PASSWORD_HASH` são temporários: após aplicar as migrations em ambiente local, entre pela tela de login atual usando essas credenciais. No primeiro login válido, o Better Auth cria a identidade e a conta de senha; em seguida, o bootstrap promove essa identidade a `ADMIN` e associa, na mesma transação, os registros antigos sem proprietário a ela. Não é necessária uma página de criação nem um `INSERT` manual em `auth_users`; inserir somente nessa tabela não cria as credenciais do Better Auth. Confirme que a conta aparece como `ADMIN` e que os registros legados receberam seu `userId`; depois disso, `AUTH_EMAIL` e `AUTH_PASSWORD_HASH` podem ser removidos. `AUTH_LEGACY_OWNER_USER_ID` não é necessário: cada requisição autenticada recebe o identificador da sessão, e os repositórios limitam leituras e gravações a esse usuário. Novas contas convidadas começam sem dados financeiros privados. Para atualizar dados de empresas, configure também `BRAPI_TOKEN`. Use `DATABASE_URL_POOLED` para o acesso de runtime e `DATABASE_URL` para Drizzle Kit e migrations. Credenciais e valores reais de ambiente não devem entrar no repositório. Revise e faça backup do banco antes de aplicar migrations; nunca use `pnpm db:migrate` contra produção sem autorização explícita.

Antes de emitir convites, confira que o primeiro login administrativo concluiu o backfill. Esta consulta deve retornar zero em todas as linhas; qualquer valor diferente de zero indica dados ainda sem proprietário e deve ser investigado antes de liberar outras contas:

```sql
SELECT 'imports' AS tabela, count(*) AS sem_proprietario FROM imports WHERE "userId" IS NULL
UNION ALL SELECT 'position_snapshots', count(*) FROM position_snapshots WHERE "userId" IS NULL
UNION ALL SELECT 'position_items', count(*) FROM position_items WHERE "userId" IS NULL
UNION ALL SELECT 'treasury_position_liquidity_facts', count(*) FROM treasury_position_liquidity_facts WHERE "userId" IS NULL
UNION ALL SELECT 'manual_portfolio_positions', count(*) FROM manual_portfolio_positions WHERE "userId" IS NULL
UNION ALL SELECT 'manual_portfolio_position_snapshots', count(*) FROM manual_portfolio_position_snapshots WHERE "userId" IS NULL
UNION ALL SELECT 'manual_portfolio_adjustment_events', count(*) FROM manual_portfolio_adjustment_events WHERE "userId" IS NULL
UNION ALL SELECT 'position_reconciliation_events', count(*) FROM position_reconciliation_events WHERE "userId" IS NULL
UNION ALL SELECT 'cdb_rate_configurations', count(*) FROM cdb_rate_configurations WHERE "userId" IS NULL
UNION ALL SELECT 'emergency_reserve_settings', count(*) FROM emergency_reserve_settings WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_objectives', count(*) FROM portfolio_objectives WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_objective_positions', count(*) FROM portfolio_objective_positions WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_objective_reference_batches', count(*) FROM portfolio_objective_reference_batches WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_objective_balance_references', count(*) FROM portfolio_objective_balance_references WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_allocation_targets', count(*) FROM portfolio_allocation_targets WHERE "userId" IS NULL
UNION ALL SELECT 'personal_investment_strategy', count(*) FROM personal_investment_strategy WHERE "userId" IS NULL
UNION ALL SELECT 'movement_items', count(*) FROM movement_items WHERE "userId" IS NULL
UNION ALL SELECT 'manual_portfolio_operations', count(*) FROM manual_portfolio_operations WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_operation_reconciliation_events', count(*) FROM portfolio_operation_reconciliation_events WHERE "userId" IS NULL
UNION ALL SELECT 'stock_opportunity_manual_inputs', count(*) FROM stock_opportunity_manual_inputs WHERE "userId" IS NULL
UNION ALL SELECT 'stock_opportunity_analysis_settings', count(*) FROM stock_opportunity_analysis_settings WHERE "userId" IS NULL
UNION ALL SELECT 'portfolio_asset_classifications', count(*) FROM portfolio_asset_classifications WHERE "userId" IS NULL;
```

O limiter de login usa `x-real-ip` como IP somente quando o ingress da aplicação sobrescreve esse cabeçalho com o endereço de origem. `x-forwarded-for` é ignorado por poder ser fornecido pelo cliente. Configure o ingress para remover/substituir `x-real-ip` antes de encaminhar a requisição; se o cabeçalho confiável estiver ausente, a limitação por e-mail continua ativa e nenhuma chave global de IP é criada.

## Dados de empresas

A navegação principal oferece **Dashboard**, **Carteira**, **Importações**, **Análises** e **Configurações**. Análises abre a busca e a análise individual de empresas; o Screener fica disponível em `/analyses/screener`, fora da navegação principal. A antiga Lista de estudo foi aposentada no Issue #117. Não há uma tela de Descobrir na jornada atual.

A base do Screener é atualizada manualmente em Configurações com cadastro e cotações da BRAPI e fatos anuais consolidados DFP da CVM. A atualização de mercado também pode ser executada separadamente. Não há cron configurado. Os dados mostram período, origem e critérios atendidos, não atendidos ou indisponíveis. As múltiplas do Screener exigem cotações verificadas com até sete dias. Atualização da base não significa que cada empresa tenha divulgado um novo demonstrativo ou que cada cotação esteja igualmente recente.

## Banco, testes e qualidade

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

A cobertura unitária configurada exige 100% para statements, branches, functions e lines. O smoke test Playwright pode ser executado com `pnpm test:e2e` após instalar o Chromium via `pnpm exec playwright install chromium`.
