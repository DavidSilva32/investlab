# InvestLab

Base técnica do InvestLab construída como um monólito Next.js com React, TypeScript, PostgreSQL e Drizzle ORM.

## Infraestrutura planejada

- **GitHub**: repositório e validação contínua.
- **Vercel**: hospedagem padrão da aplicação Next.js.
- **Neon**: PostgreSQL de produção.
- **GitHub Actions**: lint, formatação, tipos, testes unitários e build.

Frontend e backend permanecem no mesmo projeto e deploy.

## Arquitetura

```text
Route Handler -> Controller -> Service -> Repository -> Database
```

- Controllers representam a fronteira HTTP e validam entradas com schemas.
- Services concentram casos de uso e regras de negócio.
- Repositories isolam consultas e persistência.
- `src/infrastructure/database` contém a configuração técnica de PostgreSQL e Drizzle.

Não há uma camada `domain`: regras de negócio ficam inicialmente em `services`. Pastas são criadas apenas quando existir uma necessidade concreta.

## Execução local

```bash
pnpm install
pnpm dev
```

A aplicação estará disponível em `http://localhost:3000`.

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha apenas no ambiente local:

```bash
DATABASE_URL=
```

Nunca versione `.env` nem uma connection string. Em produção, configure `DATABASE_URL` nas Environment Variables da Vercel.

## Banco de dados

O projeto usa PostgreSQL com Drizzle ORM. Drizzle foi escolhido por ser leve, tipado, oferecer migrations SQL claras e se encaixar na separação Repository -> Database.

Ainda não existem tabelas de negócio. Quando houver schema concreto:

```bash
pnpm db:generate
pnpm db:migrate
```

## Testes

Testes que cobrem arquivos de aplicação espelham `src`:

```text
src/path/file.ts
tests/path/file.test.ts
```

Testes de fluxo E2E ficam em `tests/e2e`.

```bash
pnpm test
pnpm test:watch
pnpm test:e2e
```

O Playwright mantém apenas um smoke test da página inicial. Para executá-lo localmente pela primeira vez:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Comandos de qualidade

```bash
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## CI

O workflow em `.github/workflows/ci.yml` usa `pnpm install --frozen-lockfile` e executa lint, format check, typecheck, testes unitários e build.

O E2E não roda no CI nesta etapa: instalar browsers aumenta custo e complexidade, e ainda não há fluxo crítico além do smoke test. Ele permanece disponível para execução local.
