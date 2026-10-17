// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    expect(
      screen.getByText(
        "Documento em revisão — ainda não é uma versão definitiva",
      ),
    ).toBeTruthy();
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
});
