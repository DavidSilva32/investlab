// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TermsPage from "@/app/(public)/termos-de-uso/page";
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

describe("TermsPage", () => {
  it("shows the current product version and complete terms without claiming legal approval", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "Termos de Uso", level: 1 }),
    ).toBeTruthy();
    expect(
      screen.getByText(`Versão vigente do produto · ${CURRENT_TERMS_VERSION}`),
    ).toBeTruthy();
    expect(
      screen.getByText("7. Atualizações e encerramento do acesso"),
    ).toBeTruthy();
    expect(
      screen.getByText(/O InvestLab não envia ordens de compra ou venda/),
    ).toBeTruthy();
    expect(
      screen.queryByText(/aprovado juridicamente|revisão jurídica/),
    ).toBeNull();
  });
});
