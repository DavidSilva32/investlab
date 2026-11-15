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
  Globe2,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";
import { McpOtherClientGuide } from "@/app/(public)/mcp/_components/mcp-other-client-guide";
import { mcpToolGroups as toolGroups } from "@/infrastructure/mcp/mcp-tool-catalog";

const connectionSteps = [
  {
    title: "Abra a área de conectores",
    description:
      "Nas configurações do ChatGPT, procure a opção para adicionar um servidor MCP personalizado. Os nomes dos menus podem variar conforme sua conta ou espaço de trabalho.",
  },
  {
    title: "Copie os dados do InvestLab",
    description:
      "Use os botões Copiar abaixo e cole cada informação no campo com o mesmo nome. A imagem do InvestLab é opcional.",
  },
  {
    title: "Escolha OAuth e autorize",
    description:
      "Deixe as opções avançadas no modo automático. Entre no InvestLab e autorize apenas os escopos de que precisa. mcp:read consulta seus dados; mcp:write também pode alterá-los e deve ser concedido apenas quando necessário.",
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
            Conecte um cliente compatível com MCP ao InvestLab para consultar
            sua carteira e seu planejamento com a sua autorização.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => setActiveTab("connect")}
          className="min-h-11 shrink-0 gap-2"
        >
          <Image
            src="/chatgpt-icon.svg"
            alt=""
            width={18}
            height={18}
            className="size-[18px] rounded-full bg-white p-0.5"
            unoptimized
          />
          Conectar ao ChatGPT{" "}
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
                className="min-h-10 justify-start gap-2 px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Image
                  src="/chatgpt-icon.svg"
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 rounded-full bg-white p-0.5"
                  unoptimized
                />
                Conectar ao ChatGPT
              </TabsTrigger>
              <TabsTrigger
                value="other-clients"
                className="min-h-10 justify-start gap-2 px-3 text-left data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Globe2 aria-hidden="true" className="size-4" />
                Outros clientes MCP
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
                  MCP é um padrão que permite a sistemas compatíveis consultar
                  informações do InvestLab depois que você autoriza a conexão. O
                  acesso é somente para leitura.
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
                    title: "O cliente MCP consulta",
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

              <p className="text-sm leading-6 text-muted-foreground">
                Quando a conexão estiver pronta, selecione InvestLab em uma
                conversa nova. Você também pode conferir as permissões e os
                limites no menu ao lado.
              </p>
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
              <ol className="grid gap-3 md:grid-cols-3">
                {connectionSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="flex gap-3 rounded-xl border border-border bg-card p-4 sm:flex-col sm:p-5"
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
              <section
                aria-labelledby="mcp-chatgpt-fields-title"
                className="rounded-2xl border border-border bg-card p-4 sm:p-6"
              >
                <header className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      Informações para preencher
                    </p>
                    <h3
                      id="mcp-chatgpt-fields-title"
                      className="mt-1 text-lg font-semibold text-foreground"
                    >
                      Copie cada item para o ChatGPT
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Você só precisa fazer isso uma vez.
                  </p>
                </header>
                <McpConnectionValues endpoint={endpoint} />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Este endereço é da implantação pública. Para testar uma
                  instância local no ChatGPT, selecione a opção Tunnel.
                </p>
              </section>
              <Link
                href="https://developers.openai.com/api/docs/guides/custom-mcp-server"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Abrir o guia oficial do ChatGPT para servidores MCP
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </TabsContent>

            <TabsContent value="other-clients" className="mt-0">
              <McpOtherClientGuide endpoint={endpoint} />
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
                          {group.permission === "mcp:write"
                            ? "Pode alterar dados"
                            : "Somente leitura"}
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
                      <h3 className="font-semibold">mcp:write</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Permite criar, atualizar e excluir objetivos e posições
                        manuais, além de registrar saldos observados. Exige
                        autorização explícita e não executa compras nem vendas.
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
                      Limites das ferramentas
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      As ferramentas alteram apenas os dados da conta conectada,
                      exigem o escopo mcp:write e usam chave idempotente. As
                      exclusões são permanentes e requerem confirmação
                      explícita. A simulação usa premissas informadas; as
                      cotações B3 são limitadas a 10 ativos e não incluem
                      histórico, fundamentos ou preço em tempo real. A conexão
                      exige suporte a MCP remoto por HTTPS e autenticação OAuth.
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
      <p className="mt-5 text-sm text-muted-foreground">
        Para a referência OpenAPI dos endpoints REST e o catálogo MCP completo,
        consulte a{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href="/docs/api"
        >
          documentação da API
        </Link>
        .
      </p>
    </main>
  );
}
