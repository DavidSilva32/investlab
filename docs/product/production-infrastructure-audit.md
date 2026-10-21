# Auditoria de infraestrutura e custos de produção

**Issue:** #238  
**Verificado em:** 21 de outubro de 2026  
**Objetivo:** reunir evidências dos custos atuais e potenciais da operação para o beta e registrar o que ainda precisa ser confirmado antes de decidir mudanças de plano ou hospedagem.

## Resumo

O usuário confirma que hospeda o InvestLab na Vercel sem cobrança até o momento. A equipe consultada aparece no plano Hobby, sem faturas listadas, e há um deployment `READY` direcionado a produção na branch `main`. O repositório contém uma aplicação Next.js monolítica, três tarefas agendadas semanais e integrações de mercado e fundamentos.

O provedor, o plano e os custos do banco de produção não foram confirmados. O usuário informa custo zero na Vercel até o momento; o painel consultado também não listava faturas, mas o período de uso estava incompleto. Esse custo zero informado para a Vercel não comprova o custo total dos demais serviços.

**Recomendação provisória:** manter a aplicação no monólito atual e não decidir migração nem preço até conferir custos reais, configuração do banco e evidências de backup e restauração. Antes de abrir o beta a terceiros, confirmar também se o uso pretendido é compatível com o plano ativo da hospedagem.

## Fatos verificados

| Item                           | Evidência observada                                                                                                                      | O que ela confirma                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hospedagem da aplicação        | O usuário confirma que a Vercel não gerou custo até agora; a equipe consultada aparece no plano Hobby                                    | Relato do usuário e estado do painel consultado. O custo total do produto, incluindo outros serviços, não está fechado.                                                                                                                                         |
| Projeto                        | Projeto Vercel `investlab`, framework Next.js                                                                                            | O projeto está configurado na Vercel como uma aplicação Next.js.                                                                                                                                                                                                |
| Deploy de produção             | Estado `READY`, branch `main`, commit `05dcd5fe48c0fca8941aeef5fea4fe834c47dcd8`                                                         | Esse deploy foi concluído com sucesso na consulta. Não comprova disponibilidade contínua ou desempenho.                                                                                                                                                         |
| Domínio                        | `investlab-amber.vercel.app` aparece associado ao projeto                                                                                | O domínio padrão está associado ao projeto. A titularidade e o custo de eventual domínio próprio não foram verificados.                                                                                                                                         |
| Host reportado                 | O usuário confirma Vercel como hospedagem atual; a integração mostra deployment direcionado a produção                                   | O custo atual da Vercel é informado como zero. Custos de domínio próprio ou outros hosts, se houver, precisam ser confirmados separadamente.                                                                                                                    |
| Uso comercial da Vercel        | As diretrizes oficiais restringem o Hobby a uso pessoal e não comercial; uso comercial requer Pro ou Enterprise                          | Se o beta ou serviço estiver sendo usado para ganho financeiro, confirmar a classificação com a Vercel e considerar esse custo na decisão. [Diretrizes de uso justo](https://vercel.com/docs/limits/fair-use-guidelines), [preços](https://vercel.com/pricing). |
| Faturas da Vercel              | A página de faturas informou que não havia faturas                                                                                       | Não havia fatura exibida nessa conta no momento da consulta; isso não equivale a gasto total zero.                                                                                                                                                              |
| Forma de pagamento da Vercel   | Nenhuma forma de pagamento cadastrada no painel consultado                                                                               | É o estado exibido naquele painel. Não confirma cobranças em outros serviços ou contas.                                                                                                                                                                         |
| Uso da Vercel                  | Período de 21 de setembro a 21 de outubro de 2026 sem valores suficientes e ainda incompleto                                             | Não permite fechar o custo mensal nem estimar um mês completo.                                                                                                                                                                                                  |
| Consulta da API de custos      | A API de billing respondeu `404 costs_not_found`                                                                                         | A consulta não forneceu dados de custo. Não se deve interpretar o erro como custo zero.                                                                                                                                                                         |
| Variáveis do banco             | Os nomes `DATABASE_URL` e `DATABASE_URL_POOLED` aparecem configurados nos metadados de produção                                          | Há configuração para conexão direta e conexão agrupada. Os valores não foram lidos; nomes não identificam o provedor.                                                                                                                                           |
| Variável de mercado            | O nome `BRAPI_TOKEN` aparece nos metadados de produção                                                                                   | O valor não foi lido. Isso não confirma plano, limites, uso ou custo da conta BRAPI.                                                                                                                                                                            |
| Documentação de infraestrutura | README e página pública de privacidade mencionam Neon/PostgreSQL e Vercel                                                                | A política informa que a configuração efetiva ainda aguarda conferência; a documentação não confirma o endpoint conectado à produção.                                                                                                                           |
| Envio de e-mail                | Busca no repositório não encontrou dependências ou configuração identificável de Nodemailer, Resend, Postmark, SMTP, SendGrid ou Mailgun | Isso não prova que não exista serviço externo; a conta e o fluxo de e-mail precisam ser confirmados com o responsável operacional.                                                                                                                              |
| Crons                          | `vercel.json` define três agendamentos semanais                                                                                          | O código configura rotas para sincronização de fundamentos do screener, mercado e fundamentos de ações. Isso não confirma execuções bem-sucedidas em produção.                                                                                                  |

## Arquitetura observada e limites

O código e a configuração sustentam o desenho abaixo. A conexão de produção aponta para PostgreSQL por meio das variáveis configuradas, mas o serviço que hospeda o banco permanece **não confirmado**. As integrações BRAPI e CVM existem no código; suas contas, limites e custos não foram consultados nesta auditoria.

```mermaid
flowchart LR
    U[Usuários] --> V[Vercel: projeto investlab<br/>Next.js monolítico]
    V --> DB[(PostgreSQL<br/>provedor e plano não confirmados)]
    V --> B[BRAPI<br/>dados de mercado e proventos]
    V --> C[CVM<br/>fundamentos e demonstrativos]
    V -. agendamentos semanais em vercel.json .-> CR[Rotas de sincronização<br/>fundamentos e mercado]
    CR --> B
    CR --> C
```

### Divergência de documentação sobre tarefas agendadas

O arquivo `vercel.json` configura três crons semanais:

- `/api/cron/weekly-screener-sync/fundamentals` — segunda-feira às 04:00 UTC;
- `/api/cron/weekly-screener-sync/market` — segunda-feira às 08:00 UTC;
- `/api/cron/weekly-screener-sync/stock-fundamentals` — segunda-feira às 12:00 UTC.

Já o README, na seção **Dados de empresas**, afirma que não há cron configurado. O código confirma a configuração no repositório, mas é necessário verificar os agendamentos e registros de execução do deploy de produção para confirmar que estão ativos e funcionando.

## Referências públicas de preço

Os preços abaixo foram consultados em páginas públicas em 21 de outubro de 2026. São referências voláteis, sujeitas a alteração, câmbio, impostos e limites de uso. **Não comprovam o plano ativo nem qualquer fatura do InvestLab.**

| Serviço | Referência pública observada                                                       | Limite desta evidência                                                                                                                                                                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel  | Hobby: US$ 0/mês; Pro: US$ 20/mês de plataforma, com crédito de uso incluído       | Valores públicos em USD, sujeitos a impostos e uso excedente. O painel consultado mostra Hobby; se o beta for considerado comercial, a elegibilidade precisa ser confirmada. [Preços da Vercel](https://vercel.com/pricing), [diretrizes de uso justo](https://vercel.com/docs/limits/fair-use-guidelines) |
| Neon    | Free: US$ 0; Launch: cobrança conforme uso, com valor típico exibido de US$ 15/mês | Neon em produção não foi confirmado. [Preços do Neon](https://neon.com/pricing)                                                                                                                                                                                                                            |
| BRAPI   | Gratuito: R$ 0; Startup: R$ 99,99/mês ou anual, sujeito aos limites publicados     | Conta, plano, uso e faturamento do InvestLab não foram confirmados. [Planos da BRAPI](https://brapi.dev/pricing)                                                                                                                                                                                           |

## Pendências para fechar a auditoria

- [ ] Identificar o responsável operacional por Vercel, banco, domínio, BRAPI e envio de e-mails.
- [ ] Confirmar se há domínio próprio pago e registrar separadamente seu custo, renovação e responsável.
- [ ] Confirmar com a Vercel se o uso planejado para beta externo é compatível com o plano Hobby ou se exige Pro.
- [ ] Confirmar no painel do banco qual serviço e plano atendem a produção, sem inferir pelo README ou pelas variáveis de ambiente.
- [ ] Obter faturas e relatórios de uso do banco de pelo menos três meses, incluindo armazenamento, compute, transferência, backups e eventuais add-ons.
- [ ] Confirmar política e retenção de backups, última cópia disponível e evidência de um teste de restauração recente.
- [ ] Exportar um período completo de uso e as faturas da Vercel, incluindo Functions, crons, tráfego e builds quando cobrados.
- [ ] Verificar a conta, o plano, limites, uso e faturas da BRAPI.
- [ ] Verificar os custos de e-mail, registro/renovação de domínio e demais serviços externos usados em produção.
- [ ] Conferir nos logs de produção se os três crons estão habilitados, em que frequência rodam e se concluem sem erro.
- [ ] Definir requisitos operacionais ainda ausentes: disponibilidade, latência esperada, região/localização dos dados e limites de crescimento.
- [ ] Atualizar o README para remover a afirmação desatualizada de que não há cron, após confirmar o comportamento de produção.

## Critério para decisão

Quando as pendências estiverem documentadas, consolidar custos fixos e variáveis por serviço e por período, separando uso observado de projeções. Comparar alternativas de hospedagem somente se houver custo real ou limitação operacional que justifique a mudança. A decisão de preço do produto deve usar custos confirmados, taxas de pagamento, tributos variáveis e suporte; esta auditoria ainda não fornece esses valores.

**Status:** auditoria parcial. Hospedagem da aplicação identificada; custos totais, provedor do banco e recuperação de dados ainda sem evidência suficiente.
