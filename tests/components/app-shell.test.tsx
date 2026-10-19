// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/carteira" as string | null,
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: navigation.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    "aria-current": ariaCurrent,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    "aria-current"?: "page";
    "aria-label"?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
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
import {
  AppShell,
  ShellUserProvider,
  useAdminSupportView,
} from "@/components/app-shell";
import type { ShellUser } from "@/components/app-shell";
import { BrandLogo } from "@/components/brand-logo";

const admin = {
  name: "David Silva",
  email: "david@example.com",
  role: "ADMIN" as const,
};
const regularUser = { ...admin, role: "USER" as const };

function renderShell(user: ShellUser = regularUser) {
  return render(
    <ShellUserProvider user={user}>
      <AppShell title="Carteira">
        <p>Conteúdo</p>
      </AppShell>
    </ShellUserProvider>,
  );
}

function SupportModeProbe() {
  return <p>Support mode: {String(useAdminSupportView())}</p>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("shares inactive support mode with its page content for a regular user", () => {
    render(
      <ShellUserProvider user={regularUser}>
        <AppShell title="Carteira">
          <SupportModeProbe />
        </AppShell>
      </ShellUserProvider>,
    );

    expect(screen.getByText("Support mode: false")).toBeTruthy();
  });

  it("renders the authenticated identity and active navigation without fetching the session", async () => {
    navigation.pathname = "/carteira";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderShell();

    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole("link", { name: "Conectar IA" })
        .some((link) => link.getAttribute("href") === "/mcp"),
    ).toBe(true);
    expect(screen.getAllByText("David Silva").length).toBeGreaterThan(0);
    expect(screen.queryByText("Usuário autorizado")).toBeNull();
    expect(screen.queryByRole("link", { name: "Configurações" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    );
    expect(screen.getAllByText("david@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("menuitem", { name: "Meu perfil" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(
      screen
        .getAllByRole("link", { name: "Carteira" })
        .every((link) => link.getAttribute("aria-current") === "page"),
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
  });

  it("uses the semantic high-contrast sidebar surface and visible focus ring", () => {
    navigation.pathname = "/carteira";
    renderShell();

    const sidebar = screen.getByRole("complementary");
    expect(sidebar.className).toContain("bg-sidebar-background");
    expect(sidebar.className).toContain("text-sidebar-foreground");
    expect(sidebar.className).toContain("border-sidebar-border");
    expect(
      screen.getAllByRole("link", { name: "Carteira" })[0].className,
    ).toContain("focus-visible:ring-sidebar-ring");
  });

  it("groups administration in a disclosure for admins and keeps the current route open", () => {
    navigation.pathname = "/admin/usuarios";
    renderShell(admin);

    expect(
      screen.getAllByRole("button", { name: "Administração" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Usuários" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Página de apresentação" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Demonstração" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Configurações" })).toHaveLength(
      1,
    );
    expect(
      screen
        .getAllByRole("link", { name: "Usuários" })
        .every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("allows an admin to open the administration disclosure from another route", async () => {
    navigation.pathname = "/carteira";
    const user = userEvent.setup();
    renderShell(admin);

    expect(screen.queryByRole("link", { name: "Usuários" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Administração" }));
    expect(screen.getByRole("link", { name: "Usuários" })).toBeTruthy();
  });

  it("closes the mobile menu after choosing the users page", async () => {
    navigation.pathname = "/admin/usuarios";
    const user = userEvent.setup();
    renderShell(admin);

    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("link", { name: "Usuários" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the non-active users link in the mobile admin disclosure and closes after selection", async () => {
    navigation.pathname = "/carteira";
    const user = userEvent.setup();
    renderShell(admin);

    await user.click(screen.getByRole("button", { name: "Abrir menu" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Administração" }),
    );
    const usersLink = within(dialog).getByRole("link", { name: "Usuários" });
    expect(usersLink.getAttribute("href")).toBe("/admin/usuarios");
    expect(usersLink.hasAttribute("aria-current")).toBe(false);

    await user.click(usersLink);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows MCP to regular users without exposing administration", () => {
    navigation.pathname = "/analises/filtros";
    renderShell();
    expect(screen.queryByRole("button", { name: "Administração" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuários" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Conectar IA" })).toHaveLength(
      1,
    );
    const links = screen.getAllByRole("link", { name: "Análises" });
    expect(links.length).toBeGreaterThan(0);
    expect(
      links.every((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
  });

  it("supports a null pathname while rendering navigation", () => {
    navigation.pathname = null;
    renderShell();
    expect(
      screen.getAllByRole("navigation", { name: "Navegação principal" }),
    ).toHaveLength(1);
  });

  it("falls back to the account email when the profile has no name", () => {
    navigation.pathname = "/";
    renderShell({ ...regularUser, name: "" });
    expect(screen.getAllByText("david@example.com").length).toBeGreaterThan(0);
  });

  it("updates the account identity in the header after saving a name", async () => {
    navigation.pathname = "/carteira";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: true })),
    );
    const user = userEvent.setup();
    renderShell();

    await user.click(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Meu perfil" }));
    const name = screen.getByLabelText("Nome");
    await user.clear(name);
    await user.type(name, "Alex Silva");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() =>
      expect(screen.getAllByText("Alex Silva").length).toBeGreaterThan(0),
    );
  });

  it("requires the authenticated server identity provider", () => {
    expect(() =>
      render(
        <AppShell title="Carteira">
          <p>Conteúdo</p>
        </AppShell>,
      ),
    ).toThrow("AppShell precisa ser renderizado dentro de ShellUserProvider.");
  });

  it("supports the isolated brand symbol variant", () => {
    render(<BrandLogo symbolOnly />);
    expect(screen.getByTestId("investlab-symbol")).toBeTruthy();
    expect(screen.queryByText("InvestLab")).toBeNull();
  });
});
