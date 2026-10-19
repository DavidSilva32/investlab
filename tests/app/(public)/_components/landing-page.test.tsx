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

import { LandingPage } from "@/app/(public)/_components/landing-page";

afterEach(cleanup);

describe("LandingPage", () => {
  it("shows the product landing and real access paths", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: "Organize seus investimentos em um só lugar.",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Explorar demonstração/ })
        .getAttribute("href"),
    ).toBe("/demonstracao");
    expect(
      screen
        .getByRole("link", { name: "Entrar na plataforma" })
        .getAttribute("href"),
    ).toBe("/entrar");
    expect(
      screen.getByText(/acesso à plataforma é disponibilizado por convite/),
    ).toBeTruthy();
  });
});
