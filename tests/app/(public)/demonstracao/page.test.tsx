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

import DemoPage from "@/app/(public)/demonstracao/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("fictional portfolio demonstration", () => {
  it("renders static sample data, identifies it as fictional, and offers account access", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<DemoPage />);

    expect(
      screen.getByRole("heading", { name: "Uma carteira de exemplo" }),
    ).toBeTruthy();
    expect(screen.getByText(/Dados totalmente fictícios/)).toBeTruthy();
    expect(screen.getByText("CDB de exemplo")).toBeTruthy();
    expect(screen.getByText("ETF de exemplo")).toBeTruthy();
    expect(screen.getByText(/Renda fixa · Banco Aurora/)).toBeTruthy();
    expect(
      screen.getByText(/Fundos imobiliários \(FIIs\) · Corretora Horizonte/),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("link", { name: /Entrar na plataforma/ })
        .getAttribute("href"),
    ).toBe("/entrar");
  });
});
