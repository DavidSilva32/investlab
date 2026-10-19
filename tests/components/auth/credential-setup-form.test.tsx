// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
import { CredentialSetupForm } from "@/components/auth/credential-setup-form";

function renderApprovedInviteForm(token = "invitation-token") {
  return render(
    <CredentialSetupForm
      mode="invite"
      token={token}
      termsVersion="termos-2026-10-19.1"
    />,
  );
}

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("CredentialSetupForm", () => {
  it("toggles each password field independently", async () => {
    const user = userEvent.setup();
    render(<CredentialSetupForm mode="reset" token="reset-token" />);

    const password = screen.getByLabelText("Nova senha");
    const confirmation = screen.getByLabelText("Confirme a senha");

    expect((password as HTMLInputElement).type).toBe("password");
    expect((confirmation as HTMLInputElement).type).toBe("password");

    await user.click(
      screen.getByRole("button", { name: "Mostrar nova senha" }),
    );
    expect((password as HTMLInputElement).type).toBe("text");
    expect((confirmation as HTMLInputElement).type).toBe("password");

    await user.click(
      screen.getByRole("button", { name: "Mostrar confirmação da senha" }),
    );
    expect((password as HTMLInputElement).type).toBe("text");
    expect((confirmation as HTMLInputElement).type).toBe("text");

    await user.click(
      screen.getByRole("button", { name: "Ocultar nova senha" }),
    );
    expect((password as HTMLInputElement).type).toBe("password");
    expect((confirmation as HTMLInputElement).type).toBe("text");
  });

  it("fails safely when the current terms version could not be loaded", () => {
    render(<CredentialSetupForm mode="invite" token="invitation-token" />);

    expect(
      screen.getByRole("heading", {
        name: "Ativação temporariamente indisponível",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Não foi possível carregar a versão vigente/),
    ).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByLabelText("Nome")).toBeNull();
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
    expect(screen.queryByRole("button", { name: "Salvar senha" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Termos de Uso" }).getAttribute("href"),
    ).toBe("/termos-de-uso");
  });

  it("activates an invited account using the URL-bound token and the invited person’s chosen password", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApprovedInviteForm();
    expect(
      screen.getByText("7. Atualizações e encerramento do acesso"),
    ).toBeTruthy();
    await user.type(screen.getByLabelText("Nome"), "Pessoa Convidada");
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-secure-password-123",
    );
    await user.click(screen.getByRole("checkbox", { name: /Li e aceito os/ }));
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/invitations/activate",
      expect.objectContaining({
        body: JSON.stringify({
          token: "invitation-token",
          password: "A-secure-password-123",
          name: "Pessoa Convidada",
          acceptTerms: true,
          termsVersion: "termos-2026-10-19.1",
        }),
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/entrar");
  });

  it("requires an explicit terms acceptance before sending invitation activation", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderApprovedInviteForm();

    await user.type(screen.getByLabelText("Nome"), "Pessoa Convidada");
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-secure-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Aceite os Termos de Uso",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("link", { name: "Abrir os Termos em uma página completa" })
        .getAttribute("href"),
    ).toBe("/termos-de-uso");
    expect(
      screen
        .getByRole("link", { name: "Política de Privacidade" })
        .getAttribute("href"),
    ).toBe("/privacidade");
    const acceptance = screen.getByRole("checkbox");
    await user.click(acceptance);
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(acceptance);
    expect((acceptance as HTMLButtonElement).getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("uses the height available between the shared public header and footer", () => {
    const { container } = render(
      <CredentialSetupForm
        mode="invite"
        token="invitation-token"
        termsVersion="termos-2026-10-19.1"
      />,
    );

    expect(container.querySelector("main")?.className).toContain(
      "min-h-[calc(100dvh-16rem)]",
    );
  });

  it("keeps a reset token private to the request and rejects mismatched confirmation", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CredentialSetupForm mode="reset" token="reset-token" />);
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-different-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(mocks.error).toHaveBeenCalledWith("As senhas não coincidem.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the API message when credential setup is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Token expirado" }, { status: 410 }),
      ),
    );
    const user = userEvent.setup();
    render(<CredentialSetupForm mode="reset" token="expired-token" />);
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-secure-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Token expirado"),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("uses a generic feedback message for a non-Error request rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("network failure"));
    const user = userEvent.setup();
    render(<CredentialSetupForm mode="reset" token="reset-token" />);
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-secure-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(expect.any(String)),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("reports malformed form submissions and can complete a password reset", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Campos obrigatórios" }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(
      <CredentialSetupForm
        mode="invite"
        token="invitation-token"
        termsVersion="termos-2026-10-19.1"
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: /Li e aceito os/ }));
    const inviteForm = container.querySelector("form");
    inviteForm?.querySelectorAll("input").forEach((input) => input.remove());
    fireEvent.submit(inviteForm!);
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Campos obrigatórios"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/invitations/activate",
      expect.objectContaining({
        body: JSON.stringify({
          token: "invitation-token",
          password: "",
          name: "",
          acceptTerms: true,
          termsVersion: "termos-2026-10-19.1",
        }),
      }),
    );

    cleanup();
    render(<CredentialSetupForm mode="reset" token="reset-token" />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText("Nova senha"),
      "A-secure-password-123",
    );
    await user.type(
      screen.getByLabelText("Confirme a senha"),
      "A-secure-password-123",
    );
    await user.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        expect.stringContaining("Senha"),
      ),
    );
    expect(mocks.push).toHaveBeenCalledWith("/entrar");
  });
});
