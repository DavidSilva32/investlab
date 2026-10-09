// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import LoginPage from "@/app/login/page";
import { LogoutButton } from "@/components/logout-button";
import { QueryClientWrapper } from "../../utils/query-client-wrapper";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("authentication interface", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockReset();
  });

  it("validates the e-mail format before requesting login", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "invalido" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    expect(await screen.findByText(/Informe um e-mail/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the safe credentials error returned by the server in a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "E-mail ou senha incorretos." }),
      }),
    );
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("E-mail ou senha incorretos."),
    );
    expect(screen.queryByText("E-mail ou senha incorretos.")).toBeNull();
  });

  it("handles missing form fields and an error response without a message", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetch);
    render(<LoginPage />);

    const form = screen
      .getByRole("button", { name: "Entrar" })
      .closest("form")!;
    screen.getByLabelText("E-mail").remove();
    fireEvent.submit(form);

    expect(await screen.findByText(/Informe um e-mail/)).toBeTruthy();

    cleanup();
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    screen.getByLabelText("Senha").remove();
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível concluir o login.",
      ),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("redirects after login and logout", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign },
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    render(
      <QueryClientWrapper>
        <LogoutButton />
      </QueryClientWrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
  });

  it("shows a safe error when the login request cannot be completed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível concluir o login.",
      ),
    );
  });
});

it("allows the password visibility to be toggled", async () => {
  render(<LoginPage />);
  const password = screen.getByLabelText("Senha");
  expect((password as HTMLInputElement).type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
  expect((password as HTMLInputElement).type).toBe("text");
  expect(screen.getByRole("button", { name: "Ocultar senha" })).toBeTruthy();
});
