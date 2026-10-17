// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

  it("describes cookie behavior without technical jargon or consent controls", () => {
    render(<CookiePolicyPage />);

    const pageText = screen.getByRole("main").textContent ?? "";
    expect(pageText).not.toMatch(/análise estática|runtime|Better Auth/i);
    expect(pageText).toMatch(/não exibe um banner/);
    expect(pageText).toMatch(
      /permanecem no navegador até serem substituídas, removidas pelo InvestLab ou apagadas por você/,
    );
    expect(
      screen.queryByRole("button", {
        name: /aceitar|rejeitar|preferências de cookies/i,
      }),
    ).toBeNull();
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

  it("renders the shared public layout route wrapper", () => {
    render(<PublicLayout>Documento público</PublicLayout>);

    expect(screen.getByText("Documento público")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
  });
});
