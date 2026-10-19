// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticatedUser = vi.hoisted(() => ({
  get: vi.fn(),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/headers", () => ({ headers: authenticatedUser.headers }));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: authenticatedUser.get,
}));

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

import CookiePolicyPage from "@/app/(public)/cookies/page";
import PrivacyPolicyPage from "@/app/(public)/privacidade/page";
import TermsPage from "@/app/(public)/termos-de-uso/page";
import PublicLayout from "@/app/(public)/layout";
import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import { PublicSiteLayout } from "@/app/(public)/_components/public-site-layout";

afterEach(cleanup);

describe("public privacy documents", () => {
  it.each([
    ["Termos de Uso", TermsPage],
    ["Política de Privacidade", PrivacyPolicyPage],
    ["Política de Cookies", CookiePolicyPage],
  ])("renders %s with an explicit draft status", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
    expect(
      screen.getByText(
        /Documento em revisão — ainda não é uma versão definitiva/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Rascunho em revisão")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Outros documentos" }),
    ).toBeTruthy();
  });

  it("shows discreet accessible footer links and account access", () => {
    render(
      <PublicSiteLayout>
        <h1>Conteúdo</h1>
      </PublicSiteLayout>,
    );

    expect(
      screen.getByRole("navigation", { name: "Acesso à conta" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Documentos do InvestLab" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Privacidade" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cookies" })).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Entrar" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/documentos disponíveis ainda estão em revisão/),
    ).toBeTruthy();
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
    ).toBe("/");
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  it("explains optional cookie choices separately from necessary cookies", () => {
    render(<CookiePolicyPage />);

    const pageText = screen.getByRole("main").textContent ?? "";
    expect(pageText).not.toMatch(/análise estática|runtime|Better Auth/i);
    expect(pageText).toMatch(/aceitar cookies ou rejeitar os opcionais/);
    expect(pageText).toMatch(/necessários.*permanecem ativos/i);
    expect(pageText).toMatch(
      /não foram identificadas tecnologias opcionais em uso/i,
    );
    expect(pageText).toMatch(
      /permanecem no navegador até serem substituídas, removidas pelo InvestLab ou apagadas por você/,
    );
  });

  it("renders a legal page section without an optional bullet list", () => {
    render(
      <LegalDocumentPage
        title="Documento de teste"
        introduction="Resumo"
        sections={[{ title: "Seção", paragraphs: ["Conteúdo"] }]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Documento de teste" }),
    ).toBeTruthy();
    expect(screen.getByText("Conteúdo")).toBeTruthy();
  });

  it("renders disclosed bullets when a legal section provides them", () => {
    render(
      <LegalDocumentPage
        title="Documento de teste"
        introduction="Resumo"
        sections={[
          { title: "Seção", paragraphs: ["Conteúdo"], bullets: ["Item"] },
        ]}
      />,
    );

    expect(screen.getByRole("listitem").textContent).toContain("Item");
  });

  it("renders the shared public layout route wrapper for an anonymous visitor", async () => {
    authenticatedUser.get.mockResolvedValueOnce(null);
    render(await PublicLayout({ children: "Documento público" }));

    expect(screen.getByText("Documento público")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
  });

  it("keeps public documents available when session lookup fails", async () => {
    authenticatedUser.get.mockRejectedValueOnce(
      new Error("session unavailable"),
    );
    render(await PublicLayout({ children: "Documento público" }));

    expect(screen.getByText("Documento público")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
  });

  it("renders a return-to-dashboard link when the public layout has a session", async () => {
    authenticatedUser.get.mockResolvedValueOnce({ id: "user-1" });
    render(await PublicLayout({ children: "Documento autenticado" }));

    expect(screen.getByText("Documento autenticado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar ao painel" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });
});
