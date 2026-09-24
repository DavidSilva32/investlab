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

# Integração do Screener (somente no servidor)
BRAPI_TOKEN=
SCREENER_SYNC_SECRET=
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

## Screener de ações

Na tela **Análises**, a opção **Explorar ações** consulta emissores e fundamentos sincronizados no PostgreSQL. A filtragem não consulta BRAPI nem CVM em tempo real.

A V1 inclui somente símbolos ativos `subType=stock` com vínculo por match exato do CNPJ BRAPI com o cadastro CVM. Tickers fracionários terminados em `F` são associados ao ticker-base; units ficam de fora. Empresas sem correspondência exata permanecem fora do universo. Os resultados são agrupados por emissor para que várias classes não dupliquem a empresa.

A sincronização é manual por `POST /api/screener/sync`; não há cron configurado nem botão de sincronização na interface. A rota exige uma sessão autenticada e o header `Authorization: Bearer <SCREENER_SYNC_SECRET>`. Gere o segredo localmente com:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Configure `BRAPI_TOKEN` e `SCREENER_SYNC_SECRET` nas variáveis de ambiente do servidor. Não os envie ao navegador, não os registre em logs e não os versione. Consulte [docs/screener-operations.md](docs/screener-operations.md) para o procedimento de execução.

Em produção, você inicia enviando uma requisição HTTP à URL publicada (por exemplo, https://<seu-projeto>.vercel.app/api/screener/sync); não precisa abrir o painel da Vercel nem executar comandos dentro dela. A Vercel recebe a chamada e roda o processamento em uma Function. Localmente, use http://localhost:3000/api/screener/sync. O limite da Function está configurado em 300 segundos e ainda não há checkpoints nem retomada parcial. O POC ficou próximo do limite; execute manualmente, fora do horário de uso e sem concorrência. Não há cron configurado.

O schema inclui emissores, valores mobiliários, fatos financeiros auditáveis, snapshots de mercado e execuções de ingestão. A migration `0008_luxuriant_bug.sql` foi gerada, mas precisa ser aplicada manualmente com `pnpm db:migrate` antes da primeira sincronização.

**Limitação atual:** filtros de lucro, patrimônio líquido, ROE e margem líquida usam fundamentos consolidados validados para setores cobertos. Bancos, seguradoras e setores sem validação semântica não entram nesses filtros. A sincronização ainda não produz snapshots de mercado; por isso P/L e P/VP permanecem desabilitados até haver dados de mercado válidos e datados.
