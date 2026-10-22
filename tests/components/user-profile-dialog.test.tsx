// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/lib/api-client";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

import { UserProfileDialog } from "@/components/user-profile-dialog";

async function renderProfile(role: "USER" | "ADMIN" = "USER") {
  const user = userEvent.setup();
  const onNameUpdated = vi.fn();
  render(
    <UserProfileDialog
      name="David"
      email="david@example.com"
      phone={null}
      role={role}
      onNameUpdated={onNameUpdated}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Abrir menu da conta" }));
  await user.click(screen.getByRole("menuitem", { name: "Meu perfil" }));
  return { user, onNameUpdated };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("UserProfileDialog", () => {
  it("links the account menu to the privacy center", async () => {
    const user = userEvent.setup();
    render(
      <UserProfileDialog
        name="David"
        email="david@example.com"
        phone={null}
        role="USER"
        onNameUpdated={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    );

    const privacyLink = screen.getByRole("menuitem", { name: "Privacidade" });
    expect(privacyLink.getAttribute("href")).toBe("/privacidade-conta");
  });

  it("links the account menu to MCP documentation", async () => {
    const user = userEvent.setup();
    render(
      <UserProfileDialog
        name="David"
        email="david@example.com"
        phone={null}
        role="USER"
        onNameUpdated={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    );

    expect(
      screen.getByRole("menuitem", { name: "MCP" }).getAttribute("href"),
    ).toBe("/mcp");
  });

  it("shows a separate assisted recovery path when the current password is forgotten", async () => {
    await renderProfile();

    expect(screen.getByText("Esqueceu a senha atual?")).toBeTruthy();
    expect(screen.getByText(/Peça ao administrador do InvestLab/)).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Abrir redefinição assistida" }),
    ).toBeNull();
  });

  it("gives administrators a direct route to the existing assisted reset form", async () => {
    await renderProfile("ADMIN");

    expect(
      screen
        .getByRole("link", { name: "Abrir redefinição assistida" })
        .getAttribute("href"),
    ).toBe("/admin/usuarios#password-reset");
  });

  it("saves the current user's display name, keeps email read-only, and refreshes the header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, name: "David Silva", phone: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { user, onNameUpdated } = await renderProfile();

    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    expect(email.value).toBe("david@example.com");
    expect(email.readOnly).toBe(true);
    await user.clear(screen.getByLabelText("Nome"));
    await user.type(screen.getByLabelText("Nome"), "David Silva");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "David Silva", phone: null }),
    });
    expect(mocks.success).toHaveBeenCalledWith("Seu perfil foi atualizado.");
    expect(onNameUpdated).toHaveBeenCalledWith("David Silva");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows inline validation for blank and overlong names without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();
    const name = screen.getByLabelText("Nome");

    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(
      screen.getByText("Informe um nome com até 120 caracteres."),
    ).toBeTruthy();

    fireEvent.change(name, { target: { value: "n".repeat(121) } });
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a valid +55 number and sends only its national digits", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ ok: true, name: "David", phone: "11987654321" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();
    const phone = screen.getByLabelText("Telefone") as HTMLInputElement;
    expect(phone.maxLength).toBe(-1);

    fireEvent.change(phone, {
      target: { value: "+55 (11) 98765-4321" },
    });
    expect(phone.value).toBe("(11) 98765-4321");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/profile",
      expect.objectContaining({
        body: JSON.stringify({ name: "David", phone: "11987654321" }),
      }),
    );
  });

  it("preserves and rejects extra phone digits instead of truncating the number", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();
    const phone = screen.getByLabelText("Telefone") as HTMLInputElement;

    fireEvent.change(phone, { target: { value: "1198765432100" } });
    expect(phone.value).toBe("1198765432100");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    expect(
      screen.getByText("Informe DDD e 8 dígitos para fixo ou 9 para celular."),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a +55 prefix cut off before the full national number", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();
    const phone = screen.getByLabelText("Telefone") as HTMLInputElement;

    fireEvent.change(phone, { target: { value: "+55 (11) 98765-4" } });
    expect(phone.value).toBe("+55 (11) 98765-4");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));

    expect(
      screen.getByText("Informe DDD e 8 dígitos para fixo ou 9 para celular."),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the safe API message for a failed name update", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: "Não foi possível atualizar seu perfil." },
            { status: 500 },
          ),
        ),
    );
    const { user } = await renderProfile();
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Não foi possível atualizar seu perfil.",
      ),
    );
  });

  it("uses safe fallbacks for unexpected name and password errors", async () => {
    vi.spyOn(apiClient, "apiRequest")
      .mockRejectedValueOnce(new Error("internal name detail"))
      .mockRejectedValueOnce(new Error("internal password detail"));
    const { user } = await renderProfile();

    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce());

    await user.type(screen.getByLabelText("Senha atual"), "current-password");
    await user.type(screen.getByLabelText("Nova senha"), "new-password-long");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "new-password-long",
    );
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2));

    expect(mocks.error).not.toHaveBeenCalledWith("internal name detail");
    expect(mocks.error).not.toHaveBeenCalledWith("internal password detail");
  });

  it("validates new password length and confirmation before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();

    await user.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mostrar nova senha" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Mostrar conf/,
      }),
    );
    await user.type(screen.getByLabelText("Senha atual"), "current-password");
    await user.type(screen.getByLabelText("Nova senha"), "short");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "short");
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(
      screen.getByLabelText("Nova senha").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen.getByLabelText("Nova senha").getAttribute("aria-describedby"),
    ).toBe("profile-new-password-error");
    expect(
      screen
        .getByLabelText("Confirmar nova senha")
        .getAttribute("aria-invalid"),
    ).toBe("false");
    expect(
      screen.getByText("A nova senha deve ter entre 12 e 128 caracteres."),
    ).toBeTruthy();

    await user.clear(screen.getByLabelText("Nova senha"));
    await user.clear(screen.getByLabelText("Confirmar nova senha"));
    await user.type(screen.getByLabelText("Nova senha"), "new-password-long");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "different-password",
    );
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(
      screen.getByText("A confirmação não corresponde à nova senha."),
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText("Confirmar nova senha")
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByLabelText("Confirmar nova senha")
        .getAttribute("aria-describedby"),
    ).toBe("profile-confirm-password-error");
    expect(
      screen.getByLabelText("Nova senha").getAttribute("aria-invalid"),
    ).toBe("false");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows and hides each password independently with accessible state", async () => {
    const { user } = await renderProfile();
    const current = screen.getByLabelText("Senha atual") as HTMLInputElement;
    const fresh = screen.getByLabelText("Nova senha") as HTMLInputElement;
    const confirmation = screen.getByLabelText(
      "Confirmar nova senha",
    ) as HTMLInputElement;
    expect(current.type).toBe("password");
    expect(fresh.type).toBe("password");
    expect(confirmation.type).toBe("password");

    await user.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    expect(current.type).toBe("text");
    expect(fresh.type).toBe("password");
    expect(
      screen
        .getByRole("button", { name: "Ocultar senha atual" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(
      screen.getByRole("button", { name: "Mostrar nova senha" }),
    );
    expect(fresh.type).toBe("text");
    expect(confirmation.type).toBe("password");
    await user.click(
      screen.getByRole("button", {
        name: /Mostrar conf/,
      }),
    );
    expect(confirmation.type).toBe("text");

    await user.click(
      screen.getByRole("button", { name: "Ocultar nova senha" }),
    );
    expect(fresh.type).toBe("password");
    expect(current.type).toBe("text");
    expect(confirmation.type).toBe("text");
  });

  it("changes the password and clears the fields after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();

    await user.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Mostrar nova senha" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Mostrar conf/,
      }),
    );

    await user.type(screen.getByLabelText("Senha atual"), "current-password");
    await user.type(screen.getByLabelText("Nova senha"), "new-password-long");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "new-password-long",
    );
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: "current-password",
        newPassword: "new-password-long",
        confirmPassword: "new-password-long",
      }),
    });
    expect(
      (screen.getByLabelText("Senha atual") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Senha atual") as HTMLInputElement).type,
    ).toBe("password");
    expect((screen.getByLabelText("Nova senha") as HTMLInputElement).type).toBe(
      "password",
    );
    expect(
      (screen.getByLabelText("Confirmar nova senha") as HTMLInputElement).type,
    ).toBe("password");
    expect(mocks.success).toHaveBeenCalledWith("Sua senha foi alterada.");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows the client-safe current-password message and hides transport details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            message:
              "Não foi possível validar a senha atual. Confira a senha e tente novamente.",
          },
          { status: 400 },
        ),
      )
      .mockRejectedValueOnce(new Error("internal detail"));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await renderProfile();
    await user.type(screen.getByLabelText("Senha atual"), "wrong-password");
    await user.type(screen.getByLabelText("Nova senha"), "new-password-long");
    await user.type(
      screen.getByLabelText("Confirmar nova senha"),
      "new-password-long",
    );
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Não foi possível validar a senha atual. Confira a senha e tente novamente.",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "Não foi possível alterar sua senha.",
      ),
    );
    expect(
      mocks.error.mock.calls
        .flat()
        .some((message) => String(message).includes("internal detail")),
    ).toBe(false);
  });

  it("clears credentials, errors, and visibility when closing the dialog", async () => {
    const { user } = await renderProfile();
    const current = screen.getByLabelText("Senha atual") as HTMLInputElement;
    const next = screen.getByLabelText("Nova senha") as HTMLInputElement;
    await user.type(current, "private-current-password");
    await user.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    await user.type(next, "short");
    await user.type(screen.getByLabelText("Confirmar nova senha"), "short");
    await user.click(screen.getByRole("button", { name: "Trocar senha" }));
    expect(
      screen.getByText("A nova senha deve ter entre 12 e 128 caracteres."),
    ).toBeTruthy();
    expect(current.type).toBe("text");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Meu perfil" }));

    expect(
      (screen.getByLabelText("Senha atual") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText("Nova senha") as HTMLInputElement).value,
    ).toBe("");
    expect(
      screen.queryByText("A nova senha deve ter entre 12 e 128 caracteres."),
    ).toBeNull();
    expect(screen.getByLabelText("Senha atual").getAttribute("type")).toBe(
      "password",
    );
    expect(
      screen
        .getByRole("button", { name: "Mostrar senha atual" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
