// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    unoptimized: _unoptimized,
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <span aria-label={alt} data-src={src} role="img" />
  ),
}));

import { McpOtherClientGuide } from "@/app/(public)/mcp/_components/mcp-other-client-guide";

afterEach(cleanup);

describe("McpOtherClientGuide", () => {
  it("shows generic setup requirements and the reusable public server details", () => {
    const endpoint = "https://investlab.example/api/mcp";
    render(<McpOtherClientGuide endpoint={endpoint} />);

    expect(
      screen.getByRole("heading", { name: "Conectar outro cliente MCP" }),
    ).toBeTruthy();
    const steps = screen.getByRole("list", {
      name: "Como conectar outro cliente MCP",
    });
    for (const title of [
      "Adicione um servidor MCP",
      "Informe os dados do InvestLab",
      "Autorize com OAuth",
    ]) {
      expect(within(steps).getByRole("heading", { name: title })).toBeTruthy();
    }

    expect(screen.getByText(endpoint)).toBeTruthy();
    expect(screen.getByText("InvestLab")).toBeTruthy();
    expect(screen.getByText("Descrição (Description)")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Logo do InvestLab" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Baixar logo do InvestLab/ }),
    ).toBeTruthy();
    expect(screen.getByText(/servidores MCP remotos por HTTPS/)).toBeTruthy();
    expect(screen.getByText(/nomes dos menus e campos mudam/)).toBeTruthy();
    expect(
      screen.getByText(/esta conexão não está disponível nele/),
    ).toBeTruthy();
  });
});
