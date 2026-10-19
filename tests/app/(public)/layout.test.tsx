// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
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

import PublicLayout from "@/app/(public)/layout";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicLayout", () => {
  it("keeps documents public and offers sign-in to anonymous visitors", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    render(await PublicLayout({ children: "Documento público" }));

    expect(screen.getByText("Documento público")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
  });

  it("keeps public documents available if session lookup fails", async () => {
    mocks.getAuthenticatedUser.mockRejectedValueOnce(
      new Error("session unavailable"),
    );
    render(await PublicLayout({ children: "Documento público" }));

    expect(screen.getByText("Documento público")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
  });

  it("offers a dashboard return link for an authenticated visitor", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce({ id: "user-1" });
    render(await PublicLayout({ children: "Documento autenticado" }));

    expect(screen.getByText("Documento autenticado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar ao painel" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
  });
});
