# InvestLab

Base técnica do InvestLab, construída com Next.js, React, TypeScript, PostgreSQL e Drizzle ORM.

## Arquitetura

As funcionalidades de backend seguem este fluxo:

```text
Route Handler -> Controller -> Service -> Repository -> Database
```

- Controllers representam a fronteira HTTP e validam entradas com schemas.
- Services concentram os casos de uso e regras de negócio.
- Repositories isolam consultas e persistência.
- `src/infrastructure/database` contém a configuração técnica do PostgreSQL e do Drizzle.

Pastas só são criadas quando houver uma necessidade concreta. Não há camada `domain`: regras de negócio ficam inicialmente em `services`.

O logger será introduzido em `src/backend/logger` quando existir o primeiro evento operacional útil; não há logs artificiais nesta fundação.

## Banco de dados

O projeto usa PostgreSQL com Drizzle ORM. Drizzle foi escolhido por ser leve, oferecer type safety, migrations SQL claras e se encaixar diretamente na separação Repository -> Database.

1. Copie `.env.example` para `.env`.
2. Preencha `DATABASE_URL` com a conexão PostgreSQL local.
3. Quando houver um schema real, use `pnpm db:generate` e `pnpm db:migrate`.

Não existem tabelas de negócio nesta etapa.

## Testes

Testes de arquivos de aplicação espelham `src`:

```text
src/path/file.ts
tests/path/file.test.ts
```

Testes de fluxo E2E ficam em `tests/e2e` e não precisam espelhar arquivos individuais.

## Comandos

```bash
pnpm install
pnpm dev
pnpm lint
pnpm format:check
pnpm format
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## Variáveis de ambiente

| Variável       | Finalidade                     |
| -------------- | ------------------------------ |
| `DATABASE_URL` | URL de conexão com PostgreSQL. |

Nunca versione o arquivo `.env` nem valores reais de credenciais.

## CI

O workflow em `.github/workflows/ci.yml` instala dependências com lockfile e executa lint, verificação de formatação, typecheck, testes unitários e build. E2E fica separado por exigir browser.
