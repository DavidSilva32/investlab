# InvestLab

O InvestLab ajuda a acompanhar a situação financeira e a carteira como um todo. Reúne posições, movimentações, objetivos e estratégia para apoiar decisões com dados e critérios claros.

## Começar localmente

### Requisitos

- Node.js 20.9 ou superior
- pnpm 11.20.0
- Banco PostgreSQL para desenvolvimento

### Instalação

Na raiz do projeto:

```bash
pnpm install
cp .env.example .env
```

Configure no `.env`:

- `DATABASE_URL_POOLED`: conexão usada pela aplicação em execução.
- `DATABASE_URL`: conexão usada pelo Drizzle Kit e pelas migrations.
- `BETTER_AUTH_URL`: URL local da aplicação, normalmente `http://localhost:3000`.
- `AUTH_SECRET`: segredo local com pelo menos 32 caracteres.

Use credenciais de desenvolvimento. Não salve valores reais ou segredos no repositório.

Com o banco de desenvolvimento configurado, aplique as migrations e inicie a aplicação:

```bash
pnpm db:migrate
pnpm dev
```

Abra `http://localhost:3000`.

## Comandos úteis

| Comando              | Uso                                         |
| -------------------- | ------------------------------------------- |
| `pnpm lint`          | Verifica problemas de lint                  |
| `pnpm format:check`  | Verifica a formatação                       |
| `pnpm typecheck`     | Verifica os tipos TypeScript                |
| `pnpm test`          | Executa os testes                           |
| `pnpm test:coverage` | Executa os testes com cobertura             |
| `pnpm test:e2e`      | Executa os testes de ponta a ponta          |
| `pnpm build`         | Gera a versão de produção                   |
| `pnpm db:generate`   | Gera uma migration a partir do schema       |
| `pnpm db:check`      | Verifica a conexão configurada para o banco |

## Estrutura do projeto

- `src/app`: páginas e rotas da aplicação.
- `src/backend`: controllers, serviços, repositórios e integrações.
- `src/infrastructure`: banco de dados, autenticação e infraestrutura compartilhada.
- `docs`: documentação de produto, design, operação e API.

## Documentação

- [Documentação da API REST e MCP](docs/api/README.md) — referência interativa em `/docs/api` e guia MCP em `/mcp`.
- [Plano do produto](docs/product/commercial-product-plan.md)
- [Sistema de design](docs/design/design-system.md)
- [Campos dos arquivos de importação B3](docs/operations/b3-import-field-matrix.md)
