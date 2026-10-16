import { createHash, createHmac, randomBytes } from "node:crypto";
import { authRepository } from "@/backend/repositories/auth.repository";
import { ApplicationError } from "@/backend/errors/application-error";

const tokenLifetimeMs = 1000 * 60 * 60 * 24;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const createToken = () => randomBytes(32).toString("base64url");

export class AuthService {
  async updateOwnProfile(name: string, headers: Headers) {
    const { auth } = await import("@/infrastructure/auth/auth");
    let response: Response;
    try {
      response = await auth.api.updateUser({
        body: { name: name.trim() },
        headers,
        asResponse: true,
      });
    } catch {
      throw new ApplicationError("Não foi possível atualizar seu perfil.", 500);
    }
    if (!response.ok) {
      if (response.status === 401) {
        throw new ApplicationError(
          "Sua sessão não pôde ser validada. Entre novamente.",
          401,
        );
      }
      if (response.status === 403) {
        throw new ApplicationError("A alteração não foi autorizada.", 403);
      }
      throw new ApplicationError("Não foi possível atualizar seu perfil.", 500);
    }
    return this.safeAuthSuccess(response);
  }

  async changeOwnPassword(
    currentPassword: string,
    newPassword: string,
    headers: Headers,
  ) {
    const { auth } = await import("@/infrastructure/auth/auth");
    let response: Response;
    try {
      response = await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers,
        asResponse: true,
      });
    } catch {
      throw new ApplicationError("Não foi possível alterar sua senha.", 500);
    }
    if (!response.ok) {
      if (response.status === 400) {
        throw new ApplicationError(
          "Não foi possível validar a senha atual. Confira a senha e tente novamente.",
          400,
        );
      }
      if (response.status === 401) {
        throw new ApplicationError(
          "Sua sessão não pôde ser validada. Entre novamente.",
          401,
        );
      }
      if (response.status === 403) {
        throw new ApplicationError("A alteração não foi autorizada.", 403);
      }
      throw new ApplicationError("Não foi possível alterar sua senha.", 500);
    }
    // Better Auth returns the rotated session token in its JSON body when
    // other sessions are revoked. Keep only its HttpOnly cookie for the
    // current session; never expose that token to client-side code.
    return this.safeAuthSuccess(response);
  }

  private async safeAuthSuccess(response: Response) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const cookie of response.headers.getSetCookie()) {
      headers.append("Set-Cookie", cookie);
    }
    return Response.json({ ok: true }, { status: response.status, headers });
  }

  async checkLoginRateLimit(request: Request, normalizedEmail: string) {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32)
      throw new Error("Authentication rate limiter is not configured.");
    const key = (kind: string, value: string) =>
      createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
    // x-real-ip is trusted only when the ingress overwrites it. Never trust
    // x-forwarded-for, which clients can supply directly. Identity throttling
    // still applies when the trusted ingress header is absent.
    const trustedIngressIp = request.headers.get("x-real-ip")?.trim();
    return authRepository.checkAuthenticationRateLimits({
      keys: [
        ...(trustedIngressIp
          ? [{ key: key("ip", trustedIngressIp), maximum: 10 }]
          : []),
        {
          key: key("email", normalizedEmail.trim().toLowerCase()),
          maximum: 10,
        },
      ],
      now: Date.now(),
      windowMs: 60 * 1000,
    });
  }

  async listAdministrationData() {
    const [users, invitations, passwordResets] = await Promise.all([
      authRepository.listUsers(),
      authRepository.listInvitations(),
      authRepository.listPasswordResets(),
    ]);
    const now = Date.now();
    const statusOf = (item: {
      usedAt: Date | null;
      revokedAt: Date | null;
      expiresAt: Date;
    }) =>
      item.usedAt
        ? "used"
        : item.revokedAt
          ? "revoked"
          : item.expiresAt.getTime() <= now
            ? "expired"
            : "pending";
    return {
      users,
      invitations: invitations.map((invitation) => ({
        ...invitation,
        status: statusOf(invitation),
      })),
      passwordResets: passwordResets.map((reset) => ({
        ...reset,
        status: statusOf(reset),
      })),
    };
  }

  async canAttemptLogin(email: string) {
    const user = await authRepository.getLoginEligibility(email);
    return !user || user.accountStatus !== "DISABLED";
  }

  async recordSuccessfulLogin(email: string) {
    return authRepository.recordSuccessfulLogin(email);
  }

  async updateManagedUser(input: {
    id: string;
    actorId: string;
    name?: string;
    role?: "USER" | "ADMIN";
    isActive?: boolean;
  }) {
    const updates = { ...input };
    if (updates.name !== undefined) {
      updates.name = updates.name.trim();
      if (!updates.name) {
        throw new ApplicationError("Informe o nome do usuário.", 400);
      }
    }
    if (
      updates.name === undefined &&
      updates.role === undefined &&
      updates.isActive === undefined
    ) {
      throw new ApplicationError(
        "Informe ao menos um campo para atualizar.",
        400,
      );
    }

    const result = await authRepository.updateManagedUser(updates);
    if (result.kind === "not-found") {
      throw new ApplicationError("Usuário não encontrado.", 404);
    }
    if (result.kind === "self-deactivation") {
      throw new ApplicationError(
        "Você não pode desativar a própria conta.",
        409,
      );
    }
    if (result.kind === "last-admin") {
      throw new ApplicationError(
        "Não é possível desativar ou remover o papel do último administrador ativo.",
        409,
      );
    }
  }

  async createInvitation(emailValue: string, createdByUserId: string) {
    const email = emailValue.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new ApplicationError("Informe um e-mail válido.", 400);
    }
    if (await authRepository.findUserByEmail(email)) {
      throw new ApplicationError("Não foi possível emitir o convite.", 409);
    }
    const token = createToken();
    await authRepository.createInvitation({
      email,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + tokenLifetimeMs),
      createdByUserId,
    });
    return { url: `/convite/${token}` };
  }

  async revokeInvitation(id: string) {
    if (!(await authRepository.revokeInvitation(id))) {
      throw new ApplicationError("O convite não está mais pendente.", 409);
    }
  }

  async revokePasswordReset(id: string) {
    if (!(await authRepository.revokePasswordReset(id))) {
      throw new ApplicationError(
        "O link de redefinição não está mais pendente.",
        409,
      );
    }
  }

  async activateInvitation(token: string, name: string, password: string) {
    if (password.length < 12) {
      throw new ApplicationError(
        "A senha deve ter pelo menos 12 caracteres.",
        400,
      );
    }
    const invitation = await authRepository.claimInvitation(digest(token));
    if (!invitation) {
      throw new ApplicationError(
        "Este convite é inválido, expirou ou já foi utilizado.",
        400,
      );
    }
    try {
      const { auth } = await import("@/infrastructure/auth/auth");
      await auth.api.signUpEmail({
        body: {
          name: name.trim(),
          email: invitation.email,
          password,
        },
      });
    } catch {
      // A failed sign-up may have committed before its response failed. Keep
      // the invitation consumed if the account exists; otherwise allow retry.
      if (!(await authRepository.findUserByEmail(invitation.email))) {
        await authRepository.releaseInvitationClaim(invitation.id);
      }
      throw new ApplicationError(
        "Não foi possível ativar o convite. Solicite um novo link ao administrador.",
        400,
      );
    }
  }

  async createPasswordReset(emailValue: string, createdByUserId: string) {
    const email = emailValue.trim().toLowerCase();
    const user = await authRepository.findUserByEmail(email);
    if (!user)
      throw new ApplicationError(
        "Não foi possível emitir o link de redefinição.",
        404,
      );
    const token = createToken();
    await authRepository.createPasswordReset({
      userId: user.id,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + tokenLifetimeMs),
      createdByUserId,
    });
    return { url: `/redefinir-senha/${token}` };
  }

  async resetPassword(token: string, newPassword: string) {
    if (newPassword.length < 12) {
      throw new ApplicationError(
        "A senha deve ter pelo menos 12 caracteres.",
        400,
      );
    }
    const { auth } = await import("@/infrastructure/auth/auth");
    const context = await auth.$context;
    const passwordHash = await context.password.hash(newPassword);
    if (
      !(await authRepository.applyPasswordReset(digest(token), passwordHash))
    ) {
      throw new ApplicationError(
        "Este link é inválido, expirou ou já foi utilizado.",
        400,
      );
    }
  }
}

export const authService = new AuthService();
