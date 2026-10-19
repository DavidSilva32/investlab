import Link from "next/link";
import {
  ArrowUpRight,
  BookOpenCheck,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mcpResource } from "@/infrastructure/mcp/mcp-configuration";

const chatGptSetupSteps = [
  {
    title: "Abra Plugins",
    description: "No ChatGPT para web, abra Plugins e selecione o botão +.",
  },
  {
    title: "Adicione o servidor",
    description:
      "Escolha Add custom MCP server e informe um nome para identificar o InvestLab.",
  },
  {
    title: "Informe o endpoint MCP",
    description:
      "Use o endereço configurado pelo servidor abaixo. Em produção, use HTTPS público; para conexão local ou testes, o ChatGPT também aceita Secure MCP Tunnel, se disponível para sua conta.",
  },
  {
    title: "Conecte com OAuth",
    description:
      "Siga o fluxo de autorização do InvestLab e confira quais permissões estão sendo solicitadas.",
  },
  {
    title: "Revise ferramentas e permissões",
    description:
      "Confira o aviso de risco e as ferramentas descobertas antes de criar a conexão. A leitura administrativa é uma permissão separada e opcional, disponível apenas para contas ADMIN.",
  },
  {
    title: "Teste em uma conversa nova",
    description:
      "Instale a conexão, abra uma nova conversa, digite @ no campo de mensagem e selecione o plugin InvestLab.",
  },
];

const ownReadTools = [
  {
    name: "get_my_portfolio",
    description: "Consulta posições e movimentações da conta conectada.",
    example: "Exemplo: “Consulte minha carteira e movimentações.”",
  },
  {
    name: "list_my_manual_positions",
    description: "Lista as posições manuais da conta conectada.",
    example: "Exemplo: “Liste minhas posições manuais.”",
  },
];

const adminReadTools = [
  {
    name: "admin_list_users",
    description:
      "Lista apenas dados básicos para navegação. Resultados são paginados, com no máximo 50 contas por página.",
    example: "Exemplo: “Liste as contas da página 1.”",
  },
  {
    name: "admin_search_users",
    description:
      "Localiza contas por nome ou e-mail. A busca exige de 2 a 120 caracteres e retorna dados básicos em páginas de até 50 contas.",
    example: "Exemplo: “Busque a conta de ana@exemplo.com.”",
  },
  {
    name: "admin_get_user_portfolio",
    description:
      "Consulta a carteira e movimentações de uma conta por vez; exige o identificador targetUserId informado explicitamente.",
    example:
      "Exemplo: “Consulte a carteira da conta selecionada na busca anterior.”",
  },
];

function ToolList({
  tools,
}: {
  tools: Array<{ name: string; description: string; example: string }>;
}) {
  return (
    <ul className="mt-4 space-y-3">
      {tools.map((tool) => (
        <li
          key={tool.name}
          className="rounded-lg border border-border bg-background p-3"
        >
          <code className="text-sm font-semibold text-foreground">
            {tool.name}
          </code>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {tool.description}
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/80">
            {tool.example}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function McpDocumentation() {
  const endpointUrl = new URL(mcpResource);
  const isPublicHttps = endpointUrl.protocol === "https:";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="max-w-3xl">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-primary">
          <BookOpenCheck aria-hidden="true" className="size-4" />
          Conexão com ferramentas de IA
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          MCP do InvestLab
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          O MCP conecta um cliente compatível ao InvestLab para consultar dados
          autorizados da carteira. Cada conexão usa OAuth para identificar a
          conta e as permissões concedidas.
        </p>
      </header>

      <section
        aria-labelledby="mcp-capabilities"
        className="mt-8 grid gap-5 md:grid-cols-2"
      >
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle
              id="mcp-capabilities"
              role="heading"
              aria-level={2}
              className="flex items-center gap-2 text-base"
            >
              <LockKeyhole aria-hidden="true" className="size-4 text-primary" />
              Leitura da sua conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Com a permissão de leitura básica, o cliente consulta apenas a
              conta conectada. O acesso é associado à identidade validada no
              OAuth; o cliente não escolhe outra conta pelo parâmetro de uma
              chamada comum.
            </p>
            <ToolList tools={ownReadTools} />
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle
              role="heading"
              aria-level={2}
              className="flex items-center gap-2 text-base"
            >
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              Leitura administrativa opcional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Somente uma conta com perfil ADMIN pode solicitar o escopo
              adicional de leitura administrativa. Esse acesso é opcional no
              OAuth e permite localizar contas e consultar, quando selecionada,
              a carteira de um usuário. Não fica disponível para usuários
              comuns.
            </p>
            <ToolList tools={adminReadTools} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="mcp-current-limits" className="mt-5">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle
              id="mcp-current-limits"
              role="heading"
              aria-level={2}
              className="text-base"
            >
              O que esta versão permite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              <strong className="text-foreground">Somente leitura.</strong> Esta
              versão não cadastra, altera nem exclui posições ou outros dados.
            </p>
            <p>
              Em produção, o endpoint precisa estar publicado e acessível por
              HTTPS público. Para desenvolvimento local e testes, o ChatGPT
              também oferece o Secure MCP Tunnel quando estiver disponível para
              a conta. O túnel permite alcançar um servidor local ou privado;
              ele não substitui o endpoint HTTPS público para publicar um
              plugin. O endereço configurado pelo servidor é:
            </p>
            <p className="break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground sm:text-sm">
              {mcpResource}
            </p>
            {!isPublicHttps && (
              <p role="status" className="font-medium text-foreground">
                Este ambiente está configurado com HTTP local. Esse endereço não
                pode ser conectado ao ChatGPT pela internet; use o endpoint
                HTTPS público da implantação. Para testes locais, use um Secure
                MCP Tunnel se essa opção estiver habilitada na sua conta.
              </p>
            )}
            <p>
              A integração ainda não foi validada em uma conexão real com o
              ChatGPT. O recurso de MCP personalizado depende do plano, das
              permissões do workspace e da disponibilidade habilitada para a
              conta. A documentação da OpenAI descreve leitura e busca para
              usuários Pro; isso não garante que o recurso esteja disponível em
              toda conta, e não há garantia universal para Plus. Consulte a{" "}
              <Link
                href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                página de disponibilidade de MCP no ChatGPT
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="chatgpt-setup" className="mt-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">Configuração</p>
          <h2
            id="chatgpt-setup"
            className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
          >
            Conectar ao ChatGPT
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A disponibilidade dos controles pode variar entre contas e
            workspaces. Se a opção não aparecer, confira as permissões do
            workspace e os recursos habilitados na sua conta.
          </p>
        </div>
        <ol className="mt-6 space-y-4">
          {chatGptSetupSteps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/5 text-sm font-semibold text-primary"
              >
                {index + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-10 border-t border-border pt-6">
        <p className="text-sm leading-6 text-muted-foreground">
          Consulte a documentação oficial da OpenAI para ver instruções e
          disponibilidade atualizadas:{" "}
          <Link
            href="https://developers.openai.com/api/docs/guides/custom-mcp-server"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Adicionar um servidor MCP personalizado
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
          . Para testar o servidor e iniciar uma conversa, veja também{" "}
          <Link
            href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            conectar e testar seu plugin
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
