# InvestLab

InvestLab é um monólito Next.js para gestão pessoal de investimentos. Frontend, rotas HTTP e acesso ao banco fazem parte do mesmo deploy.

## Infraestrutura

- GitHub para repositório e CI;
- Vercel para hospedagem do Next.js;
- Neon para PostgreSQL de produção;
- Drizzle ORM para schema e migrations.

## Arquitetura

```text
Route Handler → Controller → Service → Repository → Database
```

A infraestrutura transversal fica em `src/infrastructure`, incluindo banco, autenticação e logging estruturado. O backend utiliza classes onde há colaboração entre componentes, sem criar um servidor separado.

## Execução local

```bash
pnpm install
pnpm dev
```

A aplicação fica disponível em `http://localhost:3000`.

## Variáveis de ambiente

Copie `.env.example` para `.env`. O arquivo `.env` é local, ignorado pelo Git e nunca deve receber valores reais em commits.

```bash
DATABASE_URL=
DATABASE_URL_POOLED=
AUTH_EMAIL=usuario@exemplo.com
AUTH_PASSWORD_HASH=<hash-gerado-pelo-script>
AUTH_SECRET=<segredo-aleatorio>
```

- `DATABASE_URL_POOLED` é usada pelo client Drizzle da aplicação em runtime.
- `DATABASE_URL` é reservada ao Drizzle Kit para migrations e operações administrativas.
- `AUTH_EMAIL` é o único e-mail autorizado a entrar.
- `AUTH_PASSWORD_HASH` recebe somente o hash gerado localmente, nunca a senha normal.
- `AUTH_SECRET` assina as sessões. Use uma string aleatória com pelo menos 32 caracteres.

Em produção, configure as mesmas variáveis nas Environment Variables da Vercel. Nunca registre, publique ou compartilhe connection strings, hashes ou secrets.

## Configuração da senha

Escolha uma senha normal e gere o hash localmente:

```bash
node scripts/hash-password.mjs "MINHA_SENHA"
```

O comando retorna um valor no formato `salt:hash`. Copie esse valor completo para `AUTH_PASSWORD_HASH` no `.env` e na Vercel.

Na tela de login, você continua digitando a senha normal (`MINHA_SENHA`), não o hash. O backend aplica scrypt com o salt armazenado e compara o resultado de modo seguro. Você não precisa memorizar o hash; se esquecer a senha, escolha uma nova, gere outro hash e substitua `AUTH_PASSWORD_HASH`.

## Banco de dados

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:check
```

`pnpm db:check` executa apenas `SELECT 1` usando a conexão pooled local. Não aplica migrations.

## Testes e qualidade

```bash
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

A cobertura unitária possui limite de 100% para statements, branches, functions e lines.

O Playwright mantém somente um smoke test E2E. Para instalar o Chromium localmente:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## CI

O workflow em `.github/workflows/ci.yml` instala dependências com pnpm e lockfile, então executa lint, format check, typecheck, testes unitários e build. O E2E permanece local neste estágio para evitar a instalação de browsers no pipeline.
