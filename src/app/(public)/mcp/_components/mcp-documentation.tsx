"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";

const connectionSteps = [
  {
    title: "Abra a área de conectores",
    description:
      "No ChatGPT, abra as configurações de conectores ou a área de criação de um servidor MCP personalizado. O nome do menu pode variar por conta e workspace.",
  },
  {
    title: "Adicione o InvestLab",
    description:
      "Escolha a opção para adicionar um servidor MCP personalizado e informe um nome para identificar esta conexão.",
  },
  {
    title: "Informe os dados do servidor",
    description:
      "Copie o endereço HTTPS e os demais valores apresentados nesta página para os campos correspondentes do ChatGPT.",
  },
  {
    title: "Escolha OAuth e autorize",
    description:
      "Deixe o ChatGPT descobrir os metadados OAuth. Entre na conta InvestLab e revise as permissões antes de aprovar.",
  },
  {
    title: "Confirme as ferramentas",
    description:
      "Confira as ferramentas que o cliente descobriu. A leitura administrativa é adicional, opcional e disponível somente para contas ADMIN.",
  },
  {
    title: "Faça uma consulta",
    description:
      "Abra uma conversa nova, selecione a conexão InvestLab e peça uma leitura que esteja descrita no catálogo abaixo.",
  },
];

const toolGroups = [
  {
    id: "portfolio",
    label: "Carteira",
    description: "Posições, movimentações e distribuição da conta conectada.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_portfolio",
        description:
          "Consulta posições importadas e manuais e movimentações registradas da conta conectada.",
        input: "Sem parâmetros.",
        output:
          "Carteira e movimentações disponíveis para a conta autenticada.",
      },
      {
        name: "list_my_manual_positions",
        description: "Lista as posições manuais da conta conectada.",
        input: "Sem parâmetros.",
        output: "Lista de posições manuais; não inclui dados de outras contas.",
      },
      {
        name: "get_my_portfolio_allocation",
        description:
          "Consulta distribuição e concentração por ativo, classe, subclasse e geografia, junto das metas cadastradas.",
        input: "Sem parâmetros.",
        output:
          "Distribuição e concentrações disponíveis; não retorna cada posição individual.",
      },
    ],
  },
  {
    id: "planning",
    label: "Planejamento",
    description:
      "Reserva de emergência, objetivos e estratégia de longo prazo.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_emergency_reserve",
        description:
          "Consulta o resumo da reserva configurada, incluindo cobertura e progresso da meta.",
        input: "Sem parâmetros.",
        output:
          "Valor conhecido, despesas mensais, meta configurada e cobertura disponível.",
      },
      {
        name: "get_my_objectives",
        description:
          "Consulta objetivos financeiros, metas, valores conhecidos, progresso e valores sem destino.",
        input: "Sem parâmetros.",
        output:
          "Resumo dos objetivos. Não retorna posições detalhadas por objetivo.",
      },
      {
        name: "get_my_long_term_strategy",
        description:
          "Consulta patrimônio classificado, alocação, metas e qualidade das datas de avaliação da estratégia de longo prazo.",
        input: "Sem parâmetros.",
        output: "Estado e composição disponíveis da estratégia cadastrada.",
      },
      {
        name: "simulate_objective_projection",
        description:
          "Calcula saldo futuro ou aporte mensal necessário com as premissas informadas.",
        input:
          "mode: project_balance com startingAmount e monthlyContribution; ou required_contribution com targetBasis e targetAmount. Ambos recebem horizonYears (1–100), annualReturnPercent e annualInflationPercent (> -100 e até 1.000), adjustContributionsForInflation. Valores monetários aceitam de zero a R$ 1 trilhão. Não consulta a carteira.",
        output:
          "Valores projetados nominais e em poder de compra, total investido e pontos mensais/anuais. No modo de aporte necessário, informa o aporte mensal calculado. Contribuições consideradas no fim do mês. Cenário hipotético; não é previsão nem recomendação financeira.",
      },
    ],
  },
  {
    id: "activity",
    label: "Acompanhamento",
    description:
      "Fechamento mensal e janela recente de operações e conciliação.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_my_monthly_portfolio_review",
        description:
          "Compara o fechamento selecionado com o anterior e indica alinhamento, cobertura e limitações.",
        input:
          "period: opcional, formato AAAA-MM. Sem período, usa o fechamento mais recente disponível.",
        output:
          "Revisão mensal disponível; variação patrimonial não equivale a rentabilidade.",
      },
      {
        name: "get_my_operations_and_reconciliation",
        description:
          "Consulta operações manuais, movimentações B3 e eventos recentes de conciliação.",
        input: "Sem parâmetros.",
        output:
          "Até 50 itens por categoria em ordem decrescente, com indicação hasMore. Não calcula candidatos nem altera dados.",
      },
    ],
  },
  {
    id: "market",
    label: "Simulação e mercado",
    description: "Projeção hipotética e consulta limitada de cotações B3.",
    permission: "mcp:read",
    tools: [
      {
        name: "get_b3_market_quotes",
        description: "Consulta cotações informativas de ativos listados na B3.",
        input:
          "tickers: de 1 a 10 códigos B3, como PETR4. Letras são normalizadas para maiúsculas.",
        output:
          "Nome, preço e horário observado; ativos indisponíveis podem ser sinalizados. Sem histórico, fundamentos ou preço em tempo real.",
      },
    ],
  },
  {
    id: "admin",
    label: "Administração",
    description:
      "Leituras adicionais para contas com perfil ADMIN e autorização explícita.",
    permission: "mcp:admin:read",
    tools: [
      {
        name: "admin_list_users",
        description: "Lista dados básicos de contas em páginas para navegação.",
        input:
          "page: inteiro de 1 a 50.000 (padrão 1); pageSize: inteiro de 1 a 50 (padrão 20).",
        output:
          "Uma página de dados básicos. Selecione uma conta antes de abrir seus dados financeiros.",
      },
      {
        name: "admin_search_users",
        description: "Localiza contas por nome ou e-mail.",
        input:
          "query: 2 a 120 caracteres; page: inteiro de 1 a 50.000 (padrão 1); pageSize: inteiro de 1 a 50 (padrão 20).",
        output:
          "Resultados paginados com dados básicos para identificar a conta.",
      },
      {
        name: "admin_get_user_portfolio",
        description:
          "Consulta carteira e movimentações de uma conta selecionada explicitamente.",
        input: "targetUserId: identificador explícito, de 1 a 255 caracteres.",
        output: "Carteira e movimentações da conta selecionada.",
      },
      {
        name: "admin_get_user_operations",
        description:
          "Consulta a janela recente de operações, movimentações e eventos de conciliação de uma conta selecionada.",
        input: "targetUserId: identificador explícito, de 1 a 255 caracteres.",
        output:
          "Até 50 itens por categoria e hasMore. Eventos não representam necessariamente vínculos atuais; sem candidatos calculados.",
      },
      {
        name: "admin_get_user_financial_snapshot",
        description:
          "Combina leituras de carteira, objetivos, estratégia, alocação, reserva e revisão mensal.",
        input:
          "targetUserId: identificador explícito, de 1 a 255 caracteres; period: opcional, formato AAAA-MM.",
        output:
          "Resumo financeiro da conta selecionada para o período disponível.",
      },
    ],
  },
];

export function McpDocumentation({ endpoint }: { endpoint: string }) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
            <BookOpenCheck aria-hidden="true" className="size-4" />
            Referência de conexão
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            MCP do InvestLab
          </h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Conecte o ChatGPT ao InvestLab para consultar sua carteira e seu
            planejamento com a sua autorização. MCP é a ponte que permite essa
            consulta.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setActiveTab("connect")}
          className="min-h-11 shrink-0 gap-2"
        >
          Ver passo a passo{" "}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation="vertical"
      >
        <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documentação
            </p>
            <TabsList
              aria-label="Seções da documentação MCP"
              className="flex h-auto w-full flex-col items-stretch justify-start gap-1 rounded-none bg-transparent p-0"
            >
              <TabsTrigger
                value="overview"
                className="min-h-10 justify-start px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Visão geral
              </TabsTrigger>
              <TabsTrigger
                value="connect"
                className="min-h-10 justify-start px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Conectar ao ChatGPT
              </TabsTrigger>
              <div
                role="presentation"
                className="mb-1 mt-5 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Ferramentas
              </div>
              {toolGroups.map((group) => (
                <TabsTrigger
                  key={group.id}
                  value={group.id}
                  className="min-h-10 justify-start px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
                >
                  {group.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {group.tools.length}
                  </span>
                </TabsTrigger>
              ))}
              <TabsTrigger
                value="permissions"
                className="mt-4 min-h-10 justify-start px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Acesso e limites
              </TabsTrigger>
            </TabsList>
          </aside>

          <div className="min-w-0">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <section
                aria-labelledby="mcp-overview-title"
                className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7"
              >
                <p className="text-sm font-semibold text-primary">Em resumo</p>
                <h2
                  id="mcp-overview-title"
                  className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
                >
                  O que é MCP?
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  É uma ponte para o ChatGPT consultar informações do InvestLab
                  depois que você autoriza a conexão. O acesso é somente para
                  leitura.
                </p>
              </section>

              <ol
                aria-label="Como funciona a conexão MCP"
                className="grid gap-3 md:grid-cols-3"
              >
                {[
                  {
                    icon: MessageSquareText,
                    title: "Você pergunta",
                    description: "Faça uma pergunta no ChatGPT.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Você autoriza",
                    description:
                      "Você entra na sua conta e aprova o acesso de leitura.",
                  },
                  {
                    icon: WalletCards,
                    title: "O ChatGPT consulta",
                    description:
                      "O InvestLab retorna os dados disponíveis para responder.",
                  },
                ].map(({ icon: Icon, title, description }, index) => (
                  <li
                    key={title}
                    className="relative flex min-h-36 gap-4 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/35 sm:p-5"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                        Etapa {index + 1}
                      </span>
                      <h3 className="mt-1 font-semibold text-foreground">
                        {title}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    {index < 2 && (
                      <ArrowRight
                        aria-hidden="true"
                        className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-background p-0.5 text-primary md:block"
                      />
                    )}
                  </li>
                ))}
              </ol>

              <section aria-labelledby="mcp-endpoint-title">
                <h2 id="mcp-endpoint-title" className="text-lg font-semibold">
                  Endereço do servidor
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use o HTTPS público ao conectar o ChatGPT.
                </p>
                <div className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <McpConnectionValues endpoint={endpoint} />
                  <p className="mt-4 text-sm font-medium text-foreground">
                    Esta URL aponta para a implantação pública. Para testar uma
                    instância local no ChatGPT, selecione a opção Tunnel.
                  </p>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="connect" className="mt-0 space-y-6">
              <div className="flex items-center gap-3">
                <Image
                  src="/chatgpt-icon.svg"
                  alt="Ícone oficial do ChatGPT"
                  width={36}
                  height={36}
                  className="size-9"
                  unoptimized
                />
                <div>
                  <p className="text-sm font-semibold text-primary">
                    Passo a passo
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Conectar ao ChatGPT
                  </h2>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Os nomes dos controles variam entre contas e workspaces. Se a
                opção de servidor MCP personalizado não aparecer, confira se o
                recurso está habilitado no seu ChatGPT.
              </p>
              <ol className="space-y-4">
                {connectionSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/5 text-sm font-semibold text-primary"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-sm leading-6 text-muted-foreground">
                No formulário de servidor personalizado, escolha autenticação
                OAuth. Não preencha credenciais manualmente: o cliente deve
                descobrir os metadados e abrir a autorização do InvestLab.
              </p>
              <Link
                href="https://developers.openai.com/api/docs/guides/custom-mcp-server"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Guia oficial de servidor MCP personalizado
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </TabsContent>

            {toolGroups.map((group) => (
              <TabsContent
                key={group.id}
                value={group.id}
                className="mt-0 space-y-6"
              >
                <header>
                  <p className="text-sm font-semibold text-primary">
                    Catálogo de ferramentas
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {group.label}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {group.description}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    <LockKeyhole aria-hidden="true" className="size-3.5" />
                    Escopo necessário: <code>{group.permission}</code>
                  </p>
                </header>
                <div className="space-y-3">
                  {group.tools.map((tool) => (
                    <article
                      key={tool.name}
                      className="rounded-xl border border-border bg-card p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-mono text-sm font-semibold text-foreground">
                          {tool.name}
                        </h3>
                        <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                          Somente leitura
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {tool.description}
                      </p>
                      <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Entrada
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-foreground">
                            {tool.input}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Retorno e limites
                          </dt>
                          <dd className="mt-1 text-sm leading-6 text-foreground">
                            {tool.output}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
                {group.id === "admin" && (
                  <p className="rounded-xl border border-status-warning/30 bg-status-warning/10 p-4 text-sm leading-6 text-foreground">
                    As ferramentas administrativas exigem a permissão separada
                    <code className="mx-1">mcp:admin:read</code>, consentimento
                    explícito e conta InvestLab com perfil ADMIN.
                  </p>
                )}
              </TabsContent>
            ))}

            <TabsContent value="permissions" className="mt-0 space-y-5">
              <div>
                <p className="text-sm font-semibold text-primary">Segurança</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  Acesso e limites
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  A autorização é feita em duas partes: o cliente identifica a
                  conta por OAuth e o InvestLab verifica o token e o escopo em
                  cada solicitação MCP.
                </p>
              </div>
              <Card className="border-border/70">
                <CardContent className="space-y-4 p-5">
                  <div className="flex gap-3">
                    <LockKeyhole
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-semibold">mcp:read</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Permite ferramentas de leitura da própria conta. É o
                        escopo padrão para uma conexão comum.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 border-t border-border pt-4">
                    <ShieldCheck
                      className="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <h3 className="font-semibold">mcp:admin:read</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Permissão adicional e opcional, disponível apenas para
                        contas ADMIN e aplicada às ferramentas administrativas.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                <div className="flex gap-3">
                  <CircleHelp
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      O que ainda não está disponível
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Não há ferramentas para gravar ou excluir dados. A
                      simulação usa somente premissas informadas. As cotações B3
                      são limitadas a 10 ativos e não incluem histórico,
                      fundamentos ou preço em tempo real. A conexão real com o
                      ChatGPT ainda depende da validação após publicação.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                Consulte a disponibilidade e os passos atuais no{" "}
                <Link
                  href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  suporte do ChatGPT
                </Link>
                .
              </p>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <section
        aria-label="Mais informações sobre MCP"
        className="mt-10 border-t border-border pt-6"
      >
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ChartNoAxesCombined aria-hidden="true" className="size-4" />
          As ferramentas retornam dados disponíveis no InvestLab; a resposta
          final do assistente pode combinar esses dados com o contexto da
          conversa.
        </p>
      </section>
    </main>
  );
}
