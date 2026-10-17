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
    ["Política de Cookies e armazenamento local", CookiePolicyPage],
  ])("renders %s as a technical draft with revision status", (title, Page) => {
    render(<Page />);

    expect(screen.getByRole("heading", { name: title, level: 1 })).toBeTruthy();
    expect(
      screen.getByText(/Texto em preparação — revisão jurídica pendente/),
    ).toBeTruthy();
    expect(screen.getByText("rascunho-2026-10-17.1")).toBeTruthy();
  });

  it("shows accessible navigation to documents and account access", () => {
    render(
      <PublicSiteLayout>
        <h1>Conteúdo</h1>
      </PublicSiteLayout>,
    );

    expect(
      screen.getByRole("navigation", { name: "Documentos e acesso" }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: "Privacidade" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Entrar" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/A identidade do controlador/)).toBeTruthy();
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
