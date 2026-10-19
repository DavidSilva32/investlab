import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  BookOpenCheck,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  CircleArrowRight,
  LockKeyhole,
  PiggyBank,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mcpResource } from "@/infrastructure/mcp/mcp-configuration";
import { McpConnectionValues } from "@/app/(public)/mcp/_components/mcp-connection-values";

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
  {
    name: "get_my_emergency_reserve",
    description:
      "Consulta o resumo da reserva configurada, com valor conhecido, despesas mensais, meta e cobertura.",
    example: "Exemplo: “Quantos meses da minha reserva eu tenho hoje?”",
  },
  {
    name: "get_my_objectives",
    description:
      "Resume metas, valores conhecidos, posições destinadas e itens sem destino.",
    example: "Exemplo: “Quanto já destinei para meus objetivos?”",
  },
  {
    name: "get_my_long_term_strategy",
    description:
      "Consulta patrimônio, composição e estado da estratégia de longo prazo.",
    example: "Exemplo: “Qual composição defini para longo prazo?”",
  },
  {
    name: "get_my_portfolio_allocation",
    description:
      "Mostra distribuição por classe, concentrações e metas de alocação.",
    example: "Exemplo: “Como está distribuída minha carteira?”",
  },
  {
    name: "get_my_monthly_portfolio_review",
    description:
      "Consulta o fechamento mensal disponível mais recente ou um período informado.",
    example:
      "Exemplo: “O que mudou na minha carteira em 2026-09?” A variação patrimonial não é rentabilidade.",
  },
  {
    name: "get_my_operations_and_reconciliation",
    description:
      "Consulta uma janela das operações manuais, movimentações B3 e eventos de conciliação mais recentes. Retorna até 50 por categoria e sinaliza truncamento. Os eventos não indicam necessariamente o estado atual dos vínculos e não são calculadas sugestões de conciliação.",
    example:
      "Exemplo: “Quais foram minhas operações e movimentações mais recentes?”",
  },
  {
    name: "simulate_objective_projection",
    description:
      "Simula saldo futuro ou aporte mensal necessário usando premissas fornecidas na conversa. Não consulta a carteira; é uma hipótese, não previsão nem recomendação financeira.",
    example:
      "Exemplo: “Quanto devo aportar para chegar a R$ 100 mil em 8 anos, com R$ 5 mil iniciais, retorno anual de 6% e inflação anual de 4%?”",
  },
  {
    name: "get_b3_market_quotes",
    description:
      "Consulta nome, preço e horário observado de até 10 ativos B3. Não retorna histórico ou fundamentos e não representa preço em tempo real.",
    example: "Exemplo: “Qual é a cotação atual de PETR4 e VALE3?”",
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
  {
    name: "admin_get_user_operations",
    description:
      "Consulta a janela recente de operações, movimentações e eventos de conciliação de uma conta por vez; exige targetUserId explícito, mostra até 50 itens por categoria e informa hasMore. Eventos recentes não representam necessariamente vínculos atuais; a ferramenta não calcula candidatos nem inclui paginação do histórico anterior.",
    example:
      "Exemplo: “Consulte as operações recentes da conta selecionada na busca.”",
  },
  {
    name: "admin_get_user_financial_snapshot",
    description:
      "Combina carteira, objetivos, estratégia, alocação, reserva e revisão mensal de uma conta identificada por targetUserId.",
    example:
      "Exemplo: “Consulte o resumo financeiro do usuário selecionado na busca.”",
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
          autorizados da carteira, planejamento, operações e cotações. Cada
          conexão usa OAuth para identificar a conta e as permissões concedidas.
        </p>
      </header>

      <section
        aria-label="Como uma pergunta vira uma consulta"
        className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      >
        <div className="grid gap-5 p-5 sm:p-7 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bot aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">Você pergunta</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                “Como está minha carteira e minha reserva?”
              </p>
            </div>
          </div>
          <CircleArrowRight
            aria-hidden="true"
            className="hidden size-5 text-muted-foreground md:block"
          />
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <BookOpenCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">
                A IA escolhe as leituras
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Pode combinar mais de uma ferramenta para responder.
              </p>
            </div>
          </div>
          <CircleArrowRight
            aria-hidden="true"
            className="hidden size-5 text-muted-foreground md:block"
          />
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-semibold text-foreground">
                InvestLab valida o acesso
              </p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Cada leitura respeita sua conta e as permissões concedidas.
              </p>
            </div>
          </div>
        </div>
      </section>

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
              a carteira, as operações recentes ou o resumo financeiro de um
              usuário. As leituras de outra conta exigem seleção explícita e não
              ficam disponíveis para usuários comuns.
            </p>
            <ToolList tools={adminReadTools} />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="mcp-question-examples" className="mt-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">
            Fale do seu jeito
          </p>
          <h2
            id="mcp-question-examples"
            className="mt-2 text-2xl font-semibold tracking-tight text-foreground"
          >
            Perguntas que você pode fazer
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Não precisa conhecer os nomes técnicos das ferramentas. O ChatGPT
            identifica as leituras necessárias e pode combiná-las.
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              Icon: WalletCards,
              question: "O que tenho na minha carteira?",
              tools: "Carteira e movimentações",
            },
            {
              Icon: Target,
              question: "Como estão meus objetivos?",
              tools: "Metas, valores e posições destinadas",
            },
            {
              Icon: PiggyBank,
              question: "Como está minha reserva?",
              tools: "Meta e meses de cobertura",
            },
            {
              Icon: ChartNoAxesCombined,
              question: "Quanto já destinei para meus objetivos?",
              tools: "Metas e valores conhecidos",
            },
            {
              Icon: ChartNoAxesCombined,
              question: "Como está minha alocação?",
              tools: "Distribuição e metas cadastradas",
            },
            {
              Icon: Target,
              question: "Qual estratégia defini para longo prazo?",
              tools: "Composição e estado atual",
            },
            {
              Icon: CalendarDays,
              question: "O que mudou no último mês?",
              tools: "Revisão mensal, com limites explicados",
            },
            {
              Icon: CalendarDays,
              question: "Quais foram minhas movimentações mais recentes?",
              tools: "Operações e eventos recentes de conciliação",
            },
            {
              Icon: Target,
              question: "Quanto preciso aportar para atingir minha meta?",
              tools: "Simulação com as premissas que você informar",
            },
            {
              Icon: ChartNoAxesCombined,
              question: "Qual a cotação de PETR4 e VALE3?",
              tools: "Consulta limitada de ativos B3",
            },
            {
              Icon: BookOpenCheck,
              question: "Quais dados você usou?",
              tools: "Peça fonte, período e limitações",
            },
          ].map(({ Icon, question, tools }) => (
            <div
              key={question}
              className="flex gap-3 rounded-xl border border-border bg-card p-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="font-medium text-foreground">“{question}”</p>
                <p className="mt-1 text-sm text-muted-foreground">{tools}</p>
              </div>
            </div>
          ))}
        </div>
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
              versão não cadastra, altera, confirma conciliações nem exclui
              dados. A simulação de objetivos usa apenas as premissas que você
              informar; não é previsão nem recomendação financeira. Para ativos
              B3, há uma consulta limitada de cotações (até 10 tickers), sem
              histórico, fundamentos, screener ou preços em tempo real.
            </p>
            <p>
              Em produção, use o endpoint HTTPS público abaixo. Para testes
              locais, o Secure MCP Tunnel só é necessário quando o servidor não
              está publicado.
            </p>
            <McpConnectionValues endpoint={mcpResource} />
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
              <p className="text-sm font-semibold text-primary">Configuração</p>
              <h2
                id="chatgpt-setup"
                className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
              >
                Conectar ao ChatGPT
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            A disponibilidade dos controles pode variar entre contas e
            workspaces. Se a opção não aparecer, confira as permissões do
            workspace e os recursos habilitados na sua conta.
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Na tela <strong>Add custom MCP server</strong>, preencha{" "}
            <strong>Name</strong>, <strong>Description</strong> e{" "}
            <strong>Server URL</strong> com os valores acima. Em{" "}
            <strong>Authentication</strong>, escolha <strong>OAuth</strong>. Use
            “Choose icon” para enviar o PNG opcional. Não é necessário preencher
            credenciais OAuth manualmente: deixe o ChatGPT descobrir os
            metadados do servidor e prossiga com a autorização do InvestLab.
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
          </Link>{" "}
          · Ícone oficial do ChatGPT fornecido pela{" "}
          <Link
            href="https://openai.com/brand/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            OpenAI
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}
