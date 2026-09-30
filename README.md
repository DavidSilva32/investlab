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

Configure `AUTH_EMAIL`, `AUTH_PASSWORD_HASH`, `AUTH_SECRET`, `DATABASE_URL_POOLED` e `DATABASE_URL`. Para atualizar dados de empresas, configure também `BRAPI_TOKEN` e `SCREENER_SYNC_SECRET`. Use `DATABASE_URL_POOLED` para o acesso de runtime e `DATABASE_URL` para Drizzle Kit e migrations. Credenciais e valores reais de ambiente não devem entrar no repositório.

## Dados de empresas

A navegação principal oferece **Dashboard**, **Carteira**, **Importações**, **Análises** e **Configurações**. Análises abre a busca e a análise individual de empresas; o Screener fica disponível em `/analyses/screener`, fora da navegação principal. A Lista de estudo continua disponível em `/study-list`, também fora da navegação principal. Não há uma tela de Descobrir na jornada atual.

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
