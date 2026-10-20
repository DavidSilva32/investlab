// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicSiteLayout } from "@/app/(public)/_components/public-site-layout";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

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

afterEach(cleanup);

describe("PublicSiteLayout", () => {
  it("offers public document links and sign-in for anonymous visitors", () => {
    render(
      <PublicSiteLayout>
        <h1>Conteúdo</h1>
      </PublicSiteLayout>,
    );

    expect(screen.getByRole("heading", { name: "Conteúdo" })).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Acesso à conta" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Entrar" }).getAttribute("href"),
    ).toBe("/entrar");
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }).getAttribute("href"),
    ).toBe("/termos-de-uso");
    expect(
      screen.getByRole("link", { name: "Landing page" }).getAttribute("href"),
    ).toBe("/apresentacao");
    expect(screen.getByRole("link", { name: "Privacidade" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cookies" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "MCP" }).getAttribute("href")).toBe(
      "/mcp",
    );
    expect(screen.getByText(new RegExp(CURRENT_TERMS_VERSION))).toBeTruthy();
  });

  it("offers the dashboard to an authenticated visitor", () => {
    render(
      <PublicSiteLayout authenticated>
        <h1>Documento</h1>
      </PublicSiteLayout>,
    );

    expect(
      screen
        .getByRole("link", { name: "Voltar ao painel" })
        .getAttribute("href"),
    ).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });
});
