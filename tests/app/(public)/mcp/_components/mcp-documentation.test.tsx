// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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
vi.mock("@/infrastructure/mcp/mcp-configuration", () => ({
  mcpResource: "https://investlab.example/api/mcp",
}));

import { McpDocumentation } from "@/app/(public)/mcp/_components/mcp-documentation";

afterEach(cleanup);

describe("McpDocumentation", () => {
  it("documents user-scoped read tools and an optional admin-only read scope", () => {
    render(<McpDocumentation />);

    const ownAccount = screen.getByRole("heading", {
      name: "Leitura da sua conta",
    }).parentElement?.parentElement;
    expect(ownAccount).toBeTruthy();
    expect(within(ownAccount!).getByText("get_my_portfolio")).toBeTruthy();
    expect(
      within(ownAccount!).getByText("list_my_manual_positions"),
    ).toBeTruthy();

    const adminRead = screen.getByRole("heading", {
      name: "Leitura administrativa opcional",
    }).parentElement?.parentElement;
    expect(adminRead).toBeTruthy();
    expect(within(adminRead!).getByText("admin_list_users")).toBeTruthy();
    expect(within(adminRead!).getByText("admin_search_users")).toBeTruthy();
    expect(
      within(adminRead!).getByText("admin_get_user_portfolio"),
    ).toBeTruthy();
    expect(within(adminRead!).getByText(/perfil ADMIN/)).toBeTruthy();
    expect(
      within(ownAccount!).getByText(/Consulte minha carteira e movimentações/),
    ).toBeTruthy();
    expect(
      within(ownAccount!).getByText(/Liste minhas posições manuais/),
    ).toBeTruthy();
    expect(
      within(adminRead!).getByText(/no máximo 50 contas por página/),
    ).toBeTruthy();
    expect(
      within(adminRead!).getByText(/Liste as contas da página 1/),
    ).toBeTruthy();
    expect(within(adminRead!).getByText(/de 2 a 120 caracteres/)).toBeTruthy();
    expect(
      within(adminRead!).getByText(/Busque a conta de ana@exemplo.com/),
    ).toBeTruthy();
    expect(
      within(adminRead!).getByText(
        /identificador targetUserId informado explicitamente/,
      ),
    ).toBeTruthy();
    expect(
      within(adminRead!).getByText(/conta selecionada na busca anterior/),
    ).toBeTruthy();
  });

  it("states read-only limits, endpoint, HTTPS and tunnel options, and unverified ChatGPT connection", () => {
    render(<McpDocumentation />);

    expect(screen.getByText(/Somente leitura/)).toBeTruthy();
    expect(screen.getByText(/não cadastra, altera nem exclui/)).toBeTruthy();
    expect(screen.getByText("https://investlab.example/api/mcp")).toBeTruthy();
    expect(
      screen.getByText(/Em produção, o endpoint precisa estar publicado/),
    ).toBeTruthy();
    expect(screen.getAllByText(/Secure MCP Tunnel/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/não substitui o endpoint HTTPS público/),
    ).toBeTruthy();
    expect(
      screen.getByText(/ainda não foi validada em uma conexão real/),
    ).toBeTruthy();
    expect(
      screen.getByText(/não há garantia universal para Plus/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "página de disponibilidade de MCP no ChatGPT",
        })
        .getAttribute("href"),
    ).toBe(
      "https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt",
    );
  });

  it("gives the ChatGPT web setup sequence and links official instructions", () => {
    render(<McpDocumentation />);

    const setupSection = screen
      .getByRole("heading", { name: "Conectar ao ChatGPT" })
      .closest("section");
    const orderedSteps = within(setupSection!).getByRole("list");
    expect(within(orderedSteps).getByText("Abra Plugins")).toBeTruthy();
    expect(
      within(orderedSteps).getByText(/Add custom MCP server/),
    ).toBeTruthy();
    expect(
      within(orderedSteps).getByText("Informe o endpoint MCP"),
    ).toBeTruthy();
    expect(within(orderedSteps).getByText("Conecte com OAuth")).toBeTruthy();
    expect(
      within(orderedSteps).getByText("Revise ferramentas e permissões"),
    ).toBeTruthy();
    expect(
      within(orderedSteps).getByText("Teste em uma conversa nova"),
    ).toBeTruthy();
    expect(screen.getByText(/digite @ no campo de mensagem/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Adicionar um servidor MCP personalizado/ })
        .getAttribute("href"),
    ).toBe("https://developers.openai.com/api/docs/guides/custom-mcp-server");
  });
});
