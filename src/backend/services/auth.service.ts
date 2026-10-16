import { createHash, createHmac, randomBytes } from "node:crypto";
import { authRepository } from "@/backend/repositories/auth.repository";
import { ApplicationError } from "@/backend/errors/application-error";

const tokenLifetimeMs = 1000 * 60 * 60 * 24;
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const createToken = () => randomBytes(32).toString("base64url");

export class AuthService {
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

  async bootstrapLegacyAdministrator(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const { credentialsService } =
      await import("@/infrastructure/auth/credentials.service");
    if (!(await credentialsService.verify(normalizedEmail, password))) {
      return false;
    }
    const { auth } = await import("@/infrastructure/auth/auth");
    const existingUser = await authRepository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const promoted = await authRepository.promoteLegacyAdmin(normalizedEmail);
      if (!promoted) throw new Error("Legacy administrator promotion failed.");
      return true;
    }
    if (await authRepository.hasAnyUser()) return false;
    await auth.api.signUpEmail({
      body: {
        name: normalizedEmail.split("@")[0],
        email: normalizedEmail,
        password,
      },
    });
    const promoted = await authRepository.promoteLegacyAdmin(normalizedEmail);
    if (!promoted) throw new Error("Legacy administrator promotion failed.");
    return true;
  }
}

export const authService = new AuthService();
