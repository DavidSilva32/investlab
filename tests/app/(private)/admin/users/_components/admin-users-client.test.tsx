// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { AdminUsersClient } from "@/app/(private)/admin/users/_components/admin-users-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("AdminUsersClient remaining action states", () => {
  it("shows an inline load error, suppresses empty states, and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce("load failed")
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os usuários",
    );
    expect(screen.queryByText("Nenhum registro.")).toBeNull();
    expect(screen.queryByText("Nenhum usuário cadastrado.")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findAllByText("Nenhum registro.")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows operation feedback for a failed invitation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      )
      .mockRejectedValueOnce("invite failed");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    await screen.findAllByText("Nenhum registro.");
    await user.type(
      screen.getByLabelText("E-mail da pessoa convidada"),
      "person@example.com",
    );
    await user.click(screen.getByRole("button", { name: /Gerar convite/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("revokes a pending assisted reset and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          users: [],
          invitations: [],
          passwordResets: [
            {
              id: "reset-1",
              email: "person@example.com",
              status: "pending",
              expiresAt: "2026-12-31",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    await screen.findByText("person@example.com");
    await user.click(screen.getByRole("button", { name: "Revogar" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/admin/password-resets/reset-1",
        { method: "DELETE" },
      ),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Link revogado."),
    );
    expect(await screen.findAllByText("Nenhum registro.")).toHaveLength(2);
  });

  it("shows fallback feedback when a revocation rejects with a non-Error value", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          users: [],
          invitations: [
            {
              id: "invite-1",
              email: "person@example.com",
              status: "pending",
              expiresAt: "2026-12-31",
            },
          ],
          passwordResets: [],
        }),
      )
      .mockRejectedValueOnce("delete failed");
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    await screen.findByText("person@example.com");
    await user.click(screen.getByRole("button", { name: "Revogar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.any(String)),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("AdminUsersClient error and link operations", () => {
  it("handles failed loading, invite, and revocation requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ message: "Falha ao carregar contas" }, { status: 500 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          users: [
            {
              id: "admin-1",
              name: "Admin",
              email: "admin@example.com",
              role: "ADMIN",
              createdAt: "2026-01-01",
            },
          ],
          invitations: [
            {
              id: "invite-1",
              email: "pending@example.com",
              status: "pending",
              expiresAt: "2026-12-31",
            },
            {
              id: "invite-2",
              email: "other@example.com",
              status: "custom status",
              expiresAt: "2026-12-31",
            },
          ],
          passwordResets: [],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: "Convite recusado" }, { status: 400 }),
      )
      .mockResolvedValueOnce(
        Response.json({ message: "RevogaÃ§Ã£o recusada" }, { status: 409 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao carregar contas",
    );
    expect(toast.error).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "Tentar novamente",
      }),
    );
    expect(await screen.findByText("Administrador")).toBeTruthy();
    expect(screen.getByText(/custom status/)).toBeTruthy();
    await user.type(
      screen.getByLabelText("E-mail da pessoa convidada"),
      "person@example.com",
    );
    await user.click(screen.getByRole("button", { name: /Gerar convite/ }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Convite recusado"),
    );
    await user.click(screen.getByRole("button", { name: "Revogar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("RevogaÃ§Ã£o recusada"),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/invitations/invite-1",
      { method: "DELETE" },
    );
  });

  it("copies issued invitation links and shows a manual-copy fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      )
      .mockResolvedValueOnce(
        Response.json({ url: "/convite/copy-token" }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<AdminUsersClient />);
    await screen.findAllByText("Nenhum registro.");
    await user.type(
      screen.getByLabelText("E-mail da pessoa convidada"),
      "person@example.com",
    );
    await user.click(screen.getByRole("button", { name: /Gerar convite/ }));
    await screen.findByDisplayValue(/copy-token/);
    await user.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/convite/copy-token`,
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Link copiado.");
    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    await user.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.any(String)),
    );
  });
});
describe("AdminUsersClient", () => {
  it("lists users and pending/used invitation states without showing tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          users: [
            {
              id: "u1",
              name: "Ana",
              email: "ana@example.com",
              role: "USER",
              createdAt: "2026-01-01",
            },
          ],
          invitations: [
            {
              id: "i1",
              email: "bia@example.com",
              status: "pending",
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
            {
              id: "i2",
              email: "caio@example.com",
              status: "used",
              expiresAt: "2026-01-01",
            },
          ],
          passwordResets: [
            {
              id: "r1",
              email: "ana@example.com",
              status: "expired",
              expiresAt: "2026-01-01",
            },
          ],
        }),
      ),
    );
    render(<AdminUsersClient />);
    expect(
      (await screen.findAllByText("ana@example.com")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Pendente/)).toBeTruthy();
    expect(screen.getByText(/Utilizado/)).toBeTruthy();
    expect(screen.getByText(/Expirado/)).toBeTruthy();
    expect(screen.queryByText(/tokenHash|secret/i)).toBeNull();
  });

  it("issues an invitation and exposes its individual link only in the current page state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      )
      .mockResolvedValueOnce(
        Response.json({ url: "/convite/one-time-token" }, { status: 201 }),
      )
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    await screen.findAllByText("Nenhum registro.");
    await user.type(
      screen.getByLabelText("E-mail da pessoa convidada"),
      "person@example.com",
    );
    await user.click(screen.getByRole("button", { name: /Gerar convite/ }));
    expect(
      await screen.findByDisplayValue(/convite\/one-time-token/),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/users",
      expect.objectContaining({ method: "POST" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("Link gerado"),
      ),
    );
  });

  it("creates assisted password-reset links and keeps previously issued raw links out of the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ users: [], invitations: [], passwordResets: [] }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { url: "/redefinir-senha/secret-reset" },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          users: [],
          invitations: [],
          passwordResets: [
            {
              id: "r1",
              email: "person@example.com",
              status: "pending",
              expiresAt: "2026-12-31",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AdminUsersClient />);
    await screen.findAllByText("Nenhum registro.");
    await user.type(
      screen.getByLabelText(/E-mail da conta cuja identidade foi confirmada/),
      "person@example.com",
    );
    await user.click(
      screen.getByRole("button", { name: /Gerar link para redefinir senha/ }),
    );
    expect(
      await screen.findByDisplayValue(/redefinir-senha\/secret-reset/),
    ).toBeTruthy();
    expect(screen.getByText("Links de redefinição de senha")).toBeTruthy();
  });
});
