"use client";

import { Globe2 } from "lucide-react";
import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";

const connectionSteps = [
  {
    title: "Adicione um servidor MCP",
    description:
      "No cliente, procure a opção para adicionar ou conectar um servidor MCP remoto.",
  },
  {
    title: "Informe os dados do InvestLab",
    description:
      "Use o endereço do servidor. Se o cliente pedir, informe também o nome, a descrição e a logo abaixo.",
  },
  {
    title: "Autorize com OAuth",
    description:
      "Continue para entrar no InvestLab, revisar as permissões e autorizar a leitura da sua conta.",
  },
] as const;

export function McpOtherClientGuide({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Globe2 aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-primary">Guia geral</p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Conectar outro cliente MCP
          </h2>
        </div>
      </header>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
        Este guia serve para clientes que aceitam servidores MCP remotos por
        HTTPS e oferecem autenticação OAuth. Os nomes dos menus e campos mudam
        de um cliente para outro.
      </p>
      <ol
        aria-label="Como conectar outro cliente MCP"
        className="grid gap-3 md:grid-cols-3"
      >
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
              <h3 className="font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <section
        aria-labelledby="mcp-other-clients-fields-title"
        className="rounded-2xl border border-border bg-card p-4 sm:p-6"
      >
        <header className="mb-4">
          <p className="text-sm font-semibold text-primary">
            Dados públicos do servidor
          </p>
          <h3
            id="mcp-other-clients-fields-title"
            className="mt-1 text-lg font-semibold text-foreground"
          >
            Use os campos que o cliente solicitar
          </h3>
        </header>
        <McpConnectionValues endpoint={endpoint} />
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Se o cliente não aceitar conexão remota por HTTPS ou não oferecer
          OAuth, esta conexão não está disponível nele. A localização das opções
          e os nomes dos campos dependem de cada cliente; consulte a
          documentação do próprio serviço. A logo é opcional e só pode ser usada
          quando o cliente permitir.
        </p>
      </section>
    </div>
  );
}
