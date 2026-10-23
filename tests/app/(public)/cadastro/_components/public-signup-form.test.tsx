// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PublicSignupForm } from "@/app/(public)/cadastro/_components/public-signup-form";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(toast.error).mockReset();
  mocks.push.mockReset();
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

async function completeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome"), "Ana Investidora");
  await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
  await user.type(
    screen.getByLabelText("Senha", { selector: "input" }),
    "Senha-segura-2026",
  );
  await user.type(
    screen.getByLabelText("Confirme a senha", { selector: "input" }),
    "Senha-segura-2026",
  );
}

describe("PublicSignupForm", () => {
  it("explains the beta limits and the email recovery limitation", () => {
    render(<PublicSignupForm termsVersion="terms-current" />);

    expect(screen.getByText("Crie sua conta")).toBeTruthy();
    expect(screen.getByText(/Teste o InvestLab por 30 dias/i)).toBeTruthy();
    expect(
      screen.getByText(
        /envio de e-mails e a recuperação automática ainda não estão disponíveis/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }).getAttribute("href"),
    ).toBe("/termos-de-uso");
    expect(
      screen
        .getByRole("link", { name: "Política de Privacidade" })
        .getAttribute("href"),
    ).toBe("/privacidade");
    expect(
      screen.getByRole("link", { name: "Entre aqui" }).getAttribute("href"),
    ).toBe("/entrar");
  });

  it("validates matching passwords and an explicit Terms acceptance before posting", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PublicSignupForm termsVersion="terms-current" />);
    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@example.com");
    await user.type(
      screen.getByLabelText("Senha", { selector: "input" }),
      "Senha-segura-2026",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha", { selector: "input" }),
      "Senha-diferente-2026",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    expect(toast.error).toHaveBeenCalledWith("As senhas não coincidem.");
    expect(fetch).not.toHaveBeenCalled();

    await user.clear(
      screen.getByLabelText("Confirme a senha", { selector: "input" }),
    );
    await user.type(
      screen.getByLabelText("Confirme a senha", { selector: "input" }),
      "Senha-segura-2026",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Aceite os Termos de Uso para criar a conta.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the validated form with the current Terms version and confirms success", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetch);
    render(<PublicSignupForm termsVersion="terms-current" />);
    await completeForm(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const request = fetch.mock.calls[0][1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      email: "ana@example.com",
      name: "Ana Investidora",
      password: "Senha-segura-2026",
      confirmation: "Senha-segura-2026",
      acceptTerms: true,
      termsVersion: "terms-current",
    });
    expect(await screen.findByText("Sua conta está pronta")).toBeTruthy();
    expect(screen.getByText(/somente leitura/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ir para o acesso" }));
    expect(mocks.push).toHaveBeenCalledWith("/entrar");
  });

  it("uses empty-value fallbacks when optional form data entries are absent", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetch);
    render(<PublicSignupForm termsVersion="terms-current" />);
    await completeForm(user);
    await user.click(screen.getByRole("checkbox"));
    screen.getByLabelText("Nome").remove();
    screen.getByLabelText("E-mail").remove();
    screen.getByLabelText("Senha", { selector: "input" }).remove();
    screen.getByLabelText("Confirme a senha", { selector: "input" }).remove();
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(
      JSON.parse(String((fetch.mock.calls[0][1] as RequestInit).body)),
    ).toMatchObject({
      email: "",
      name: "",
      password: "",
      confirmation: "",
    });
  });

  it("shows safe API errors and permits showing or hiding both password fields", async () => {
    const user = userEvent.setup();
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "Não foi possível criar a conta com esses dados.",
      }),
    });
    vi.stubGlobal("fetch", fetch);
    render(<PublicSignupForm termsVersion="terms-current" />);
    await completeForm(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(
      screen
        .getByLabelText("Senha", { selector: "input" })
        .getAttribute("type"),
    ).toBe("text");
    await user.click(screen.getByRole("button", { name: "Ocultar senha" }));
    expect(
      screen
        .getByLabelText("Senha", { selector: "input" })
        .getAttribute("type"),
    ).toBe("password");
    await user.click(
      screen.getByRole("button", { name: "Mostrar confirmação da senha" }),
    );
    expect(
      screen
        .getByLabelText("Confirme a senha", { selector: "input" })
        .getAttribute("type"),
    ).toBe("text");
    await user.click(
      screen.getByRole("button", { name: "Ocultar confirmação da senha" }),
    );
    expect(
      screen
        .getByLabelText("Confirme a senha", { selector: "input" })
        .getAttribute("type"),
    ).toBe("password");
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível criar a conta com esses dados.",
      ),
    );
  });

  it("uses the safe fallback when the signup request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private details")),
    );
    render(<PublicSignupForm termsVersion="terms-current" />);
    await completeForm(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(
      screen.getByRole("button", { name: "Criar conta beta gratuita" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível criar sua conta.",
      ),
    );
  });
});
