// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({
    alt,
    unoptimized: _unoptimized,
    src,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));
import { McpDocumentation } from "@/app/(public)/mcp/_components/mcp-documentation";

afterEach(cleanup);

const publicMcpEndpoint = "https://investlab-amber.vercel.app/api/mcp";

function selectTab(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false,
  });
}

describe("McpDocumentation", () => {
  it("explains MCP simply and keeps the overview focused on how it works", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);

    expect(
      screen.getByRole("heading", { name: "MCP do InvestLab" }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Visão geral/ })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /Conectar ao ChatGPT/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /Outros clientes MCP/ }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Carteira/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Administração/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "O que é MCP?" })).toBeTruthy();
    expect(
      screen.getByText(/MCP é um padrão que permite a sistemas compatíveis/),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Como funciona a conexão MCP" }),
    ).toBeTruthy();
    expect(screen.queryByText(publicMcpEndpoint)).toBeNull();
  });

  it("opens the ChatGPT setup guide from the primary action", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Conectar ao ChatGPT/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Conectar ao ChatGPT" }),
    ).toBeTruthy();
  });

  it("shows localized copy fields, the ChatGPT logo, setup steps, and official instructions", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);
    selectTab(/Conectar ao ChatGPT/);

    const setupPanel = screen.getByRole("tabpanel");
    const orderedSteps = within(setupPanel).getByRole("list");
    for (const step of [
      "Abra a área de conectores",
      "Copie os dados do InvestLab",
      "Escolha OAuth e autorize",
    ]) {
      expect(within(orderedSteps).getByText(step)).toBeTruthy();
    }
    expect(within(setupPanel).getByText(publicMcpEndpoint)).toBeTruthy();
    expect(
      within(setupPanel).getByText("Nome do servidor (Name)"),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByText("Descrição (Description)"),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByText("Endereço do servidor (Server URL)"),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByText("Autenticação (Authentication)"),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByRole("img", { name: "Logo do InvestLab" }),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByRole("img", { name: "Ícone oficial do ChatGPT" }),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByRole("link", {
        name: /Baixar logo do InvestLab/,
      }),
    ).toBeTruthy();
    expect(
      within(setupPanel).getByText(
        /ChatGPT encontra as configurações automaticamente/,
      ),
    ).toBeTruthy();
    expect(
      within(setupPanel)
        .getByRole("link", {
          name: /guia oficial do ChatGPT para servidores MCP/,
        })
        .getAttribute("href"),
    ).toBe("https://developers.openai.com/api/docs/guides/custom-mcp-server");
  });

  it("guides other remote MCP clients without claiming universal compatibility", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);
    selectTab(/Outros clientes MCP/);

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("heading", {
        name: "Conectar outro cliente MCP",
      }),
    ).toBeTruthy();
    expect(
      within(panel).getByText(/servidores MCP remotos por HTTPS/),
    ).toBeTruthy();
    expect(
      within(panel).getAllByText(/autenticação OAuth/).length,
    ).toBeGreaterThan(0);
    expect(
      within(panel).getByRole("list", {
        name: "Como conectar outro cliente MCP",
      }),
    ).toBeTruthy();
    expect(within(panel).getByText(publicMcpEndpoint)).toBeTruthy();
    expect(
      within(panel).getByRole("img", { name: "Logo do InvestLab" }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("link", { name: /Baixar logo do InvestLab/ }),
    ).toBeTruthy();
    expect(
      within(panel).getByText(/nomes dos menus e campos mudam/),
    ).toBeTruthy();
    expect(
      within(panel).getByText(/esta conexão não está disponível nele/),
    ).toBeTruthy();
  });

  it("documents input and return contracts for each tool group", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);

    const expectations = [
      {
        tab: "Carteira",
        tools: [
          "get_my_portfolio",
          "list_my_manual_positions",
          "get_my_portfolio_allocation",
        ],
      },
      {
        tab: "Planejamento",
        tools: [
          "get_my_emergency_reserve",
          "get_my_objectives",
          "get_my_long_term_strategy",
          "simulate_objective_projection",
        ],
      },
      {
        tab: "Acompanhamento",
        tools: [
          "get_my_monthly_portfolio_review",
          "get_my_operations_and_reconciliation",
        ],
      },
      { tab: "Simulação e mercado", tools: ["get_b3_market_quotes"] },
      {
        tab: "Administração",
        tools: [
          "admin_list_users",
          "admin_search_users",
          "admin_get_user_portfolio",
          "admin_get_user_operations",
          "admin_get_user_financial_snapshot",
        ],
      },
    ];

    for (const group of expectations) {
      selectTab(new RegExp(group.tab));
      const panel = screen.getByRole("tabpanel");
      for (const toolName of group.tools) {
        expect(
          within(panel).getByRole("heading", { name: toolName }),
        ).toBeTruthy();
      }
      expect(within(panel).getAllByText("Entrada").length).toBe(
        group.tools.length,
      );
      expect(within(panel).getAllByText("Retorno e limites").length).toBe(
        group.tools.length,
      );
    }

    selectTab(/Acompanhamento/);
    expect(screen.getByText(/formato AAAA-MM/)).toBeTruthy();
    selectTab(/Simulação e mercado/);
    expect(screen.getByText(/de 1 a 10 códigos B3/)).toBeTruthy();
    selectTab(/Administração/);
    expect(screen.getAllByText(/mcp:admin:read/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/perfil ADMIN/).length).toBeGreaterThan(0);
  });

  it("explains access scopes, read-only limits, and the generic client guide", () => {
    render(<McpDocumentation endpoint={publicMcpEndpoint} />);
    selectTab(/Acesso e limites/);

    const panel = screen.getByRole("tabpanel");
    expect(
      within(panel).getByRole("heading", { name: "mcp:read" }),
    ).toBeTruthy();
    expect(
      within(panel).getByRole("heading", { name: "mcp:admin:read" }),
    ).toBeTruthy();
    expect(
      within(panel).getByText(
        /Não há ferramentas para gravar ou excluir dados/,
      ),
    ).toBeTruthy();
    expect(within(panel).getByText(/use o guia geral da seção/)).toBeTruthy();
    expect(
      within(panel)
        .getByRole("link", { name: "suporte do ChatGPT" })
        .getAttribute("href"),
    ).toBe(
      "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt",
    );
  });
});
