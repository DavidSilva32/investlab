// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminUsersTable,
  type ManagedUser,
} from "@/app/(private)/admin/users/_components/admin-users-table";

const users: ManagedUser[] = [
  {
    id: "user-1",
    name: "Ana Souza",
    email: "ana@example.com",
    phone: "11987654321",
    role: "USER",
    accountStatus: "ACTIVE",
    betaActivatedAt: "2026-09-01T12:00:00.000Z",
    betaExpiresAt: "2026-10-30T12:00:00.000Z",
    lastLoginAt: "2026-10-15T12:00:00.000Z",
    createdAt: "2026-09-01T12:00:00.000Z",
  },
  {
    id: "user-2",
    name: "Bruno Lima",
    email: "bruno@example.com",
    phone: null,
    role: "ADMIN",
    accountStatus: "DISABLED",
    betaActivatedAt: null,
    betaExpiresAt: null,
    lastLoginAt: null,
    createdAt: "2026-09-02T12:00:00.000Z",
  },
  {
    id: "user-3",
    name: "Caio Reis",
    email: "caio@example.com",
    phone: null,
    role: "USER",
    accountStatus: "PENDING",
    betaActivatedAt: null,
    betaExpiresAt: null,
    lastLoginAt: "invalid-date",
    createdAt: "2026-09-03T12:00:00.000Z",
  },
  {
    id: "user-4",
    name: "Daniel Reis",
    email: "daniel@example.com",
    phone: null,
    role: "USER",
    accountStatus: "ACTIVE",
    betaActivatedAt: "2026-09-04T12:00:00.000Z",
    betaExpiresAt: null,
    lastLoginAt: null,
    createdAt: "2026-09-04T12:00:00.000Z",
  },
];

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(cleanup);

describe("AdminUsersTable", () => {
  it("shows name, email, phone, account states, and access dates", () => {
    render(
      <AdminUsersTable
        users={users}
        invitations={[
          {
            id: "invite-1",
            email: "bia@example.com",
            status: "pending",
          },
          {
            id: "invite-2",
            email: "caio@example.com",
            status: "used",
          },
        ]}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText("(11) 98765-4321")).toBeTruthy();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("bruno@example.com")).toBeTruthy();
    expect(screen.getByText("caio@example.com")).toBeTruthy();
    expect(screen.getByText("bia@example.com")).toBeTruthy();
    expect(screen.getAllByText("Ativo")).toHaveLength(2);
    expect(screen.getByText("Desativado")).toBeTruthy();
    expect(screen.getAllByText("Aguardando")).toHaveLength(2);
    expect(screen.getByText(/15\/10\/2026/)).toBeTruthy();
    expect(screen.getAllByText("Sem registro disponível")).toHaveLength(3);
    expect(screen.getByText("Data indisponível")).toBeTruthy();
  });

  it("filters by email and role using the shared table filter", async () => {
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "E-mail" }));
    await user.type(
      screen.getByRole("textbox", { name: "Valor para E-mail" }),
      "bruno",
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByText("bruno@example.com")).toBeTruthy();
    expect(screen.queryByText("ana@example.com")).toBeNull();
  });

  it("filters users by their saved telephone number", async () => {
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Telefone" }));
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Telefone" }),
      "987654321",
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.queryByText("bruno@example.com")).toBeNull();
  });

  it("filters by role and account status values", async () => {
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[
          { id: "invite-1", email: "invitee@example.com", status: "pending" },
        ]}
        onUpdate={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Papel" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Administrador" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByText("bruno@example.com")).toBeTruthy();
    expect(screen.queryByText("ana@example.com")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Situação" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Desativado" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(screen.getByText("bruno@example.com")).toBeTruthy();
    expect(screen.queryByText("ana@example.com")).toBeNull();
  });

  it("sorts by role, account status, and last access", async () => {
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[
          {
            id: "invite-sort",
            email: "invitee@example.com",
            status: "pending",
          },
        ]}
        onUpdate={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Papel" }));
    expect(screen.getAllByRole("row")[1].textContent).toContain(
      "bruno@example.com",
    );

    await user.click(screen.getByRole("button", { name: "Situação" }));
    expect(screen.getAllByRole("row")[1].textContent).toContain(
      "ana@example.com",
    );

    await user.click(
      screen.getByRole("button", { name: "Último acesso registrado" }),
    );
    expect(screen.getAllByRole("row")[1].textContent).toContain(
      "bruno@example.com",
    );
  });

  it("updates role and account status through the protected update callback", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Papel de ana@example.com" }),
    );
    await user.click(screen.getByRole("option", { name: "Administrador" }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("user-1", { role: "ADMIN" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para bruno@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Ativar conta" }));
    expect(onUpdate).toHaveBeenCalledWith("user-2", { isActive: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Desativar conta" }));
    expect(onUpdate).not.toHaveBeenCalledWith("user-1", { isActive: false });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/perderá o acesso ao InvestLab/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Desativar usuário" }));
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("user-1", { isActive: false }),
    );
  });

  it("cancels deactivation without updating the account", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Desativar conta" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open when deactivation fails", async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Desativar conta" }));
    await user.click(screen.getByRole("button", { name: "Desativar usuário" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("user-1", { isActive: false }),
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("edits a user's name and keeps the dialog open when the update fails", async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar nome" }));
    const nameInput = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Silva");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("user-1", { name: "Ana Silva" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes the name dialog after a successful update", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar nome" }));
    const nameInput = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Silva");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancels editing without submitting the name change", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar nome" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("closes the rename dialog with Escape while idle", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar nome" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("keeps the rename dialog open on Escape while saving, then closes after success", async () => {
    let resolveUpdate!: (updated: boolean) => void;
    const pendingUpdate = new Promise<boolean>((resolve) => {
      resolveUpdate = resolve;
    });
    const onUpdate = vi.fn().mockReturnValue(pendingUpdate);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar nome" }));
    const nameInput = screen.getByRole("textbox", { name: "Nome" });
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Silva");
    await user.click(screen.getByRole("button", { name: "Salvar nome" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("user-1", { name: "Ana Silva" }),
    );
    expect(screen.getByRole("button", { name: "Salvando…" })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();

    resolveUpdate(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the empty state when there are no accounts or pending invitations", () => {
    render(
      <AdminUsersTable
        users={[]}
        invitations={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );
    expect(
      screen.getByText("Nenhum usuário ou convite aguardando ativação."),
    ).toBeTruthy();
  });

  it("lets an administrator extend an active user's beta access", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Estender beta por 30 dias" }),
    );

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
    const [, changes] = onUpdate.mock.calls[0] as [
      string,
      { betaExpiresAt: string },
    ];
    expect(changes.betaExpiresAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(new Date(changes.betaExpiresAt).getTime()).toBeGreaterThan(
      new Date(users[0].betaExpiresAt as string).getTime(),
    );
  });

  it("requires the account email before deleting its data", async () => {
    const onDelete = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir conta e dados" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Excluir definitivamente",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.type(
      screen.getByRole("textbox", {
        name: "Para confirmar, digite ana@example.com",
      }),
      "ana@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir definitivamente" }),
    );

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith("user-1", "ana@example.com"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears deletion confirmation when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onDelete={vi.fn().mockResolvedValue(true)}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir conta e dados" }),
    );
    const emailInput = screen.getByRole("textbox", {
      name: "Para confirmar, digite ana@example.com",
    });
    await user.type(emailInput, "ana@example.com");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir conta e dados" }),
    );
    expect(
      screen
        .getByRole("textbox", {
          name: "Para confirmar, digite ana@example.com",
        })
        .getAttribute("value"),
    ).toBe("");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps deletion open while the server is processing", async () => {
    let finishDelete: (result: boolean) => void = () => undefined;
    const onDelete = vi.fn(
      () => new Promise<boolean>((resolve) => (finishDelete = resolve)),
    );
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={users}
        invitations={[]}
        onUpdate={vi.fn().mockResolvedValue(true)}
        onDelete={onDelete}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Excluir conta e dados" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Para confirmar, digite ana@example.com",
      }),
      "ana@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: "Excluir definitivamente" }),
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeTruthy();

    finishDelete(false);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Excluir definitivamente" }),
      ).toBeTruthy(),
    );
  });

  it("extends beta from the current date when no expiry has been recorded", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <AdminUsersTable
        users={[{ ...users[0], betaExpiresAt: null }]}
        invitations={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ações para ana@example.com" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Estender beta por 30 dias" }),
    );

    const [, changes] = onUpdate.mock.calls[0] as [
      string,
      { betaExpiresAt: string },
    ];
    expect(changes.betaExpiresAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(onUpdate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ betaExpiresAt: expect.any(String) }),
    );
  });

  it("shows read-only beta state when access has expired", () => {
    render(
      <AdminUsersTable
        users={[{ ...users[0], betaExpiresAt: "2020-01-01T00:00:00.000Z" }]}
        invitations={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("Beta vencido · somente leitura")).toBeTruthy();
  });
});
