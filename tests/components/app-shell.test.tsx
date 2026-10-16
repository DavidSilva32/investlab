// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/carteira" as string | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page";
    "aria-label"?: string;
  }) => (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>Sair</button>,
}));
import { AppShell } from "@/components/app-shell";
import { BrandLogo } from "@/components/brand-logo";

it("ignores session request results after the shell unmounts", async () => {
  let resolveRequest!: (response: Response) => void;
  const request = new Promise<Response>((resolve) => {
    resolveRequest = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => request),
  );
  const shell = render(
    <AppShell title="Conta">
      <p>Context</p>
    </AppShell>,
  );
  shell.unmount();
  await act(async () => {
    resolveRequest(Response.json({ user: { role: "ADMIN" } }));
    await request;
  });
  let rejectRequest!: (error: Error) => void;
  const failedRequest = new Promise<Response>((_, reject) => {
    rejectRequest = reject;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => failedRequest),
  );
  const failedShell = render(
    <AppShell title="Conta">
      <p>Context</p>
    </AppShell>,
  );
  failedShell.unmount();
  await act(async () => {
    rejectRequest(new Error("session unavailable"));
    await failedRequest.catch(() => undefined);
  });
});

it("keeps administration hidden when the session endpoint is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  render(
    <AppShell title="Conta">
      <p>Context</p>
    </AppShell>,
  );
  expect(
    await screen.findAllByRole("link", { name: "Dashboard" }),
  ).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /Usu/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Config/ })).toBeNull();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("renders navigation, title and user context", () => {
    navigation.pathname = "/carteira";
    render(
      <AppShell title="Carteira">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Importações" })).toBeNull();
    expect(
      screen
        .getAllByRole("link", { name: "Aprender" })
        .every((link) => link.getAttribute("href") === "/aprender"),
    ).toBe(true);
    expect(
      screen
        .getByRole("link", { name: "InvestLab, página inicial" })
        .getAttribute("href"),
    ).toBe("/");
    const symbol = screen.getByTestId("investlab-symbol");
    expect(symbol.getAttribute("aria-hidden")).toBe("true");
    const gradientIds = Array.from(
      symbol.querySelectorAll("linearGradient"),
    ).map((gradient) => gradient.id);
    const paintReferences = Array.from(
      symbol.querySelectorAll("[fill], [stroke]"),
    )
      .map(
        (shape) => shape.getAttribute("fill") ?? shape.getAttribute("stroke"),
      )
      .filter((paint) => paint?.startsWith("url(#"))
      .map((paint) => paint?.slice(5, -1));
    expect(paintReferences.length).toBeGreaterThan(0);
    paintReferences.forEach((id) => expect(gradientIds).toContain(id));
    expect(screen.getAllByText("Carteira").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Usuário autorizado").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: "Carteira" })
        .every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("supports the isolated symbol variant", () => {
    render(<BrandLogo symbolOnly />);
    expect(screen.getByTestId("investlab-symbol")).toBeTruthy();
    expect(screen.queryByText("InvestLab")).toBeNull();
  });

  it("keeps the analysis navigation active on nested analysis paths", () => {
    navigation.pathname = "/analises/filtros";
    render(
      <AppShell title="Explorar">
        <p>Conteúdo</p>
      </AppShell>,
    );
    const links = screen.getAllByRole("link", { name: "Análises" });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.className.includes("bg-brand"))).toBe(
      true,
    );
    expect(
      links.every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("keeps planning active on its route", () => {
    navigation.pathname = "/planejamento";
    render(
      <AppShell title="Planejamento">
        <p>Conteúdo</p>
      </AppShell>,
    );
    const links = screen.getAllByRole("link", { name: "Planejamento" });
    expect(links.length).toBeGreaterThan(0);
    expect(
      links.every((link) => link.getAttribute("href") === "/planejamento"),
    ).toBe(true);
    expect(
      links.every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("handles a null pathname while rendering the navigation", () => {
    navigation.pathname = null;
    render(
      <AppShell title="Carregando">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(
      screen.getAllByRole("navigation", { name: "Navegação principal" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows the administration item only for an ADMIN session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ user: { role: "ADMIN" } })),
    );
    render(
      <AppShell title="Admin">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(
      await screen.findAllByRole("link", { name: "Usuários" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Configurações" })).toHaveLength(
      1,
    );
  });

  it("does not show administration navigation for USER sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ user: { role: "USER" } })),
    );
    render(
      <AppShell title="Conta">
        <p>Conteúdo</p>
      </AppShell>,
    );
    expect(
      await screen.findAllByRole("link", { name: "Dashboard" }),
    ).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Usuários" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Configurações" })).toBeNull();
  });
});
