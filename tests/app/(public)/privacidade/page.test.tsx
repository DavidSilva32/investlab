// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PrivacyPolicyPage from "@/app/(public)/privacidade/page";

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

describe("PrivacyPolicyPage", () => {
  it("identifies its review state and describes account and portfolio data", () => {
    render(<PrivacyPolicyPage />);

    expect(
      screen.getByRole("heading", {
        name: "Política de Privacidade",
        level: 1,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Rascunho em revisão")).toBeTruthy();
    expect(screen.getByText(/identidade e os dados de contato/)).toBeTruthy();
    expect(
      screen.getByText(/posições, instituições financeiras, movimentações/),
    ).toBeTruthy();
  });
});
