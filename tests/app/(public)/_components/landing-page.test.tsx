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

vi.mock("next/image", () => ({
  default: ({
    alt,
    fill: _fill,
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import { LandingPage } from "@/app/(public)/_components/landing-page";

afterEach(cleanup);

describe("LandingPage", () => {
  it("explains the product and keeps the public paths grounded in existing flows", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: /Entenda o que você tem\. Cuide do que importa\./,
      }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: /Explorar a demonstração/ })
        .some((link) => link.getAttribute("href") === "/demonstracao"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "Entre na sua conta" })
        .getAttribute("href"),
    ).toBe("/entrar");
    expect(
      screen.getByText(
        /acesso a uma conta pessoal continua sendo disponibilizado por convite/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Antes de explorar" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Dados, pessoas, instituições e percentuais são fictícios/,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/plano gratuito/i)).toBeNull();
    expect(screen.queryByText(/crie sua conta agora/i)).toBeNull();
  });

  it("presents the approved content areas and educational topics", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", {
        name: "Mais contexto para cuidar do seu dinheiro com calma.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Você não precisa virar especialista para dar o primeiro passo.",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Renda fixa" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ações e BDRs" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "ETFs internacionais" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Fundos imobiliários (FIIs)" }),
    ).toBeTruthy();
  });
});
