import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controller: {
    adminData: vi.fn(),
    createInvite: vi.fn(),
    revokeInvite: vi.fn(),
    revokePasswordReset: vi.fn(),
    createPasswordReset: vi.fn(),
    activateInvite: vi.fn(),
    resetPassword: vi.fn(),
  },
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/backend/controllers/auth.controller", () => ({
  authController: mocks.controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (_method: string, _route: string, handler: Function) =>
    handler,
}));
vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import {
  GET as getUsers,
  POST as postInvite,
} from "@/app/api/admin/users/route";
import { DELETE as deleteInvite } from "@/app/api/admin/invitations/[id]/route";
import { POST as postReset } from "@/app/api/admin/password-resets/route";
import { DELETE as deleteReset } from "@/app/api/admin/password-resets/[id]/route";
import { POST as activateInvite } from "@/app/api/auth/invitations/activate/route";
import { POST as consumeReset } from "@/app/api/auth/password-resets/consume/route";
import { GET as getSession } from "@/app/api/auth/session/route";

describe("auth administration route handlers", () => {
  it("delegates user listing and invitation creation", async () => {
    const request = new Request("https://test/api/admin/users");
    const response = Response.json({ users: [] });
    mocks.controller.adminData.mockResolvedValueOnce(response);
    mocks.controller.createInvite.mockResolvedValueOnce(response);
    await expect(getUsers(request)).resolves.toBe(response);
    await expect(
      postInvite(
        new Request("https://test/api/admin/users", { method: "POST" }),
      ),
    ).resolves.toBe(response);
    expect(mocks.controller.adminData).toHaveBeenCalledWith(request);
    expect(mocks.controller.createInvite).toHaveBeenCalledOnce();
  });

  it("delegates invitation and reset revocation with route parameters", async () => {
    const invitationRequest = new Request(
      "https://test/api/admin/invitations/invite-1",
      { method: "DELETE" },
    );
    const resetRequest = new Request(
      "https://test/api/admin/password-resets/reset-1",
      { method: "DELETE" },
    );
    const invitationResponse = Response.json({ ok: true });
    const resetResponse = Response.json({ ok: true });
    mocks.controller.revokeInvite.mockResolvedValueOnce(invitationResponse);
    mocks.controller.revokePasswordReset.mockResolvedValueOnce(resetResponse);
    await expect(
      deleteInvite(invitationRequest, {
        params: Promise.resolve({ id: "i1" }),
      }),
    ).resolves.toBe(invitationResponse);
    await expect(
      deleteReset(resetRequest, { params: Promise.resolve({ id: "r1" }) }),
    ).resolves.toBe(resetResponse);
    expect(mocks.controller.revokeInvite).toHaveBeenCalledWith(
      invitationRequest,
      "i1",
    );
    expect(mocks.controller.revokePasswordReset).toHaveBeenCalledWith(
      resetRequest,
      "r1",
    );
  });

  it("delegates assisted reset creation and public credential consumption", async () => {
    const resetIssueRequest = new Request(
      "https://test/api/admin/password-resets",
      { method: "POST" },
    );
    const activationRequest = new Request(
      "https://test/api/auth/invitations/activate",
      { method: "POST" },
    );
    const resetConsumeRequest = new Request(
      "https://test/api/auth/password-resets/consume",
      { method: "POST" },
    );
    const responses = [
      Response.json({ url: "/redefinir-senha/token" }),
      Response.json({ ok: true }),
      Response.json({ ok: true }),
    ];
    mocks.controller.createPasswordReset.mockResolvedValueOnce(responses[0]);
    mocks.controller.activateInvite.mockResolvedValueOnce(responses[1]);
    mocks.controller.resetPassword.mockResolvedValueOnce(responses[2]);
    await expect(postReset(resetIssueRequest)).resolves.toBe(responses[0]);
    await expect(activateInvite(activationRequest)).resolves.toBe(responses[1]);
    await expect(consumeReset(resetConsumeRequest)).resolves.toBe(responses[2]);
    expect(mocks.controller.createPasswordReset).toHaveBeenCalledWith(
      resetIssueRequest,
    );
    expect(mocks.controller.activateInvite).toHaveBeenCalledWith(
      activationRequest,
    );
    expect(mocks.controller.resetPassword).toHaveBeenCalledWith(
      resetConsumeRequest,
    );
  });

  it("returns only the public identity fields from a validated session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce({
      id: "user-1",
      email: "user@example.com",
      role: "USER",
      password: "must-not-leak",
    });
    const response = await getSession(
      new Request("https://test/api/auth/session"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { id: "user-1", email: "user@example.com", role: "USER" },
    });
  });

  it("reports an expired session without exposing account information", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce(null);
    const response = await getSession(
      new Request("https://test/api/auth/session"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ user: null });
  });
});
