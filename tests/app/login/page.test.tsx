// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import { LogoutButton } from "@/components/logout-button";
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
describe("authentication interface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("shows invalid login feedback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "x" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );
    expect(await screen.findByText("E-mail ou senha inválidos.")).toBeTruthy();
  });
  it("redirects after login and logout", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      configurable: true,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<LoginPage />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });
});
