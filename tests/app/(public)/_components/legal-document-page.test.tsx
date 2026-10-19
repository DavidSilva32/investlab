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

import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";

afterEach(cleanup);

describe("LegalDocumentPage", () => {
  it("presents a standalone draft with accessible links to the other documents", () => {
    render(
      <LegalDocumentPage
        title="Política de Privacidade"
        introduction="Informações sobre o tratamento de dados."
        sections={[
          {
            title: "Dados utilizados",
            paragraphs: ["Os dados são usados para oferecer o serviço."],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Política de Privacidade",
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Rascunho em revisão")).toBeTruthy();
    expect(screen.queryByText("Documento em revisão")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }).getAttribute("href"),
    ).toBe("/termos-de-uso");
    expect(
      screen
        .getByRole("link", { name: "Política de Cookies" })
        .getAttribute("href"),
    ).toBe("/cookies");
    expect(
      screen.getByRole("navigation", { name: "Outros documentos" }),
    ).toBeTruthy();
  });

  it("supports a current product status without a draft warning", () => {
    render(
      <LegalDocumentPage
        title="Termos de Uso"
        introduction="Condições de uso."
        sections={[{ title: "Acesso", paragraphs: ["Acesso por convite."] }]}
        statusLabel="Versão vigente do produto · termos-2026-10-19.1"
      />,
    );

    expect(
      screen.getByText("Versão vigente do produto · termos-2026-10-19.1"),
    ).toBeTruthy();
    expect(screen.queryByText("Documento em revisão")).toBeNull();
  });

  it("shows review context only when a document needs it", () => {
    render(
      <LegalDocumentPage
        title="Política de Privacidade"
        introduction="Informações sobre dados."
        sections={[{ title: "Dados", paragraphs: ["Conteúdo."] }]}
        reviewNotice="Alguns detalhes ainda aguardam confirmação."
      />,
    );

    expect(screen.getByText("Documento em revisão")).toBeTruthy();
    expect(
      screen.getByText(/Alguns detalhes ainda aguardam confirmação/),
    ).toBeTruthy();
  });

  it("renders the optional section bullet list", () => {
    render(
      <LegalDocumentPage
        title="Política de Cookies"
        introduction="Preferências de cookies."
        sections={[
          {
            title: "Suas opções",
            paragraphs: ["Você controla os cookies opcionais."],
            bullets: [
              "Aceitar cookies opcionais",
              "Rejeitar cookies opcionais",
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Aceitar cookies opcionais").tagName).toBe("LI");
    expect(screen.getByText("Rejeitar cookies opcionais").tagName).toBe("LI");
  });
});
