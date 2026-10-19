// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { LoginForm } from "@/app/(public)/login/_components/login-form";
import { LogoutButton } from "@/components/logout-button";
import { QueryClientWrapper } from "../../../../utils/query-client-wrapper";

const push = vi.hoisted(() => vi.fn());
const supportUrl =
  "https://wa.me/5521986721163?text=Ol%C3%A1%2C%20preciso%20de%20ajuda";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("login form", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.mocked(toast.error).mockReset();
  });

  it("uses the available public-layout height instead of another full viewport", () => {
    const { container } = render(<LoginForm supportWhatsAppUrl={supportUrl} />);

    expect(container.querySelector("main")?.className).toContain(
      "min-h-[calc(100dvh-16rem)]",
    );
  });

  it("validates the e-mail format before requesting login", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "invalido" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    expect(await screen.findByText("Informe um e-mail válido.")).toBeTruthy();
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
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);

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

  it("handles missing form fields and a response without a message", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetch);
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);

    const form = screen
      .getByRole("button", { name: "Entrar" })
      .closest("form")!;
    screen.getByLabelText("E-mail").remove();
    fireEvent.submit(form);

    expect(await screen.findByText("Informe um e-mail válido.")).toBeTruthy();

    cleanup();
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);
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
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    render(
      <QueryClientWrapper>
        <LogoutButton />
      </QueryClientWrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/entrar"));
  });

  it("shows a safe error when the login request cannot be completed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);

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

  it("shows a pending state while the login request is in progress", async () => {
    let completeRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            completeRequest = resolve;
          }),
      ),
    );
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@exemplo.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    expect(
      screen
        .getByRole("button", { name: "Entrando..." })
        .hasAttribute("disabled"),
    ).toBe(true);
    completeRequest?.(Response.json({ ok: true }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("preserves password visibility and offers verified WhatsApp support", async () => {
    render(<LoginForm supportWhatsAppUrl={supportUrl} />);
    const password = screen.getByLabelText("Senha");
    expect((password as HTMLInputElement).type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect((password as HTMLInputElement).type).toBe("text");

    fireEvent.click(
      screen.getByRole("button", { name: "Esqueceu sua senha?" }),
    );
    expect(
      screen.getByText(/verificar sua identidade por um canal confiável/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Nunca envie sua senha pelo WhatsApp/),
    ).toBeTruthy();
    const supportLink = screen.getByRole("link", {
      name: "Falar com o suporte pelo WhatsApp",
    });
    expect(supportLink.getAttribute("href")).toBe(supportUrl);
    expect(supportLink.getAttribute("target")).toBe("_blank");
    expect(decodeURIComponent(supportUrl)).not.toContain("usuario@exemplo.com");
  });

  it("shows safe instructions and no broken button when support is missing", async () => {
    render(<LoginForm supportWhatsAppUrl={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Esqueceu sua senha?" }),
    );

    expect(
      screen.getByText(/WhatsApp de suporte ainda não está configurado/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Falar com o suporte pelo WhatsApp" }),
    ).toBeNull();
  });
});
