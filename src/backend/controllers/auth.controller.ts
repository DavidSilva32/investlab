import { z } from "zod";
import { authService } from "@/backend/services/auth.service";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  requireAuthenticatedUser,
  requireRole,
} from "@/infrastructure/auth/authorization";
import { logger } from "@/infrastructure/logging/logger";
import { ADMIN_SUPPORT_VIEW_COOKIE } from "@/backend/services/admin-support-view.service";

function errorType(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ApplicationError) {
    return Response.json(
      { message: error.message },
      { status: error.statusCode },
    );
  }
  return Response.json(
    { message: "Não foi possível concluir a solicitação." },
    { status: 500 },
  );
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function profileErrorResponse(error: unknown) {
  return noStore(errorResponse(error));
}

const inviteSchema = z.object({ email: z.email() });
const activateSchema = z
  .object({
    token: z.string().min(32),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(12).max(128),
    acceptTerms: z.literal(true),
    termsVersion: z.string().min(1).max(40),
  })
  .strict();
const resetIssueSchema = z.object({ email: z.email() });
const resetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12).max(128),
});
const managedUserUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    isActive: z.boolean().optional(),
    betaExpiresAt: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.role !== undefined ||
      body.isActive !== undefined ||
      body.betaExpiresAt !== undefined,
  );
const managedUserDeleteSchema = z.object({ confirmEmail: z.email() }).strict();
const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().max(32).nullable().optional(),
  })
  .strict();
const ownPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(12).max(128),
    confirmPassword: z.string().min(12).max(128),
  })
  .strict()
  .refine((body) => body.newPassword === body.confirmPassword);

export class AuthController {
  async logout(_request: Request, response: Response) {
    response.headers.append(
      "Set-Cookie",
      `${ADMIN_SUPPORT_VIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  async updateOwnProfile(request: Request) {
    try {
      const user = await requireAuthenticatedUser(request.headers);
      const body = profileUpdateSchema.safeParse(await jsonBody(request));
      if (!body.success) {
        return Response.json(
          { message: "Informe um nome com até 120 caracteres." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const response = await authService.updateOwnProfile(
        user.id,
        body.data.name,
        body.data.phone,
      );
      return noStore(response);
    } catch (error) {
      return profileErrorResponse(error);
    }
  }

  async changeOwnPassword(request: Request) {
    try {
      await requireAuthenticatedUser(request.headers);
      const body = ownPasswordChangeSchema.safeParse(await jsonBody(request));
      if (!body.success) {
        return Response.json(
          { message: "Confira as senhas e tente novamente." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      const response = await authService.changeOwnPassword(
        body.data.currentPassword,
        body.data.newPassword,
        request.headers,
      );
      return noStore(response);
    } catch (error) {
      return profileErrorResponse(error);
    }
  }

  async adminData(request: Request) {
    try {
      await requireRole("ADMIN", request.headers);
      return noStore(Response.json(await authService.listAdministrationData()));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async updateUser(request: Request, id: string) {
    try {
      const admin = await requireRole("ADMIN", request.headers);
      const body = managedUserUpdateSchema.safeParse(await jsonBody(request));
      if (!body.success) {
        return Response.json(
          { message: "Informe nome, papel ou situação válida para atualizar." },
          { status: 400 },
        );
      }
      await authService.updateManagedUser({
        id,
        actorId: admin.id,
        ...body.data,
      });
      return Response.json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async deleteUser(request: Request, id: string) {
    try {
      const admin = await requireRole("ADMIN", request.headers);
      const body = managedUserDeleteSchema.safeParse(await jsonBody(request));
      if (!body.success) {
        return Response.json(
          { message: "Informe o e-mail da conta para confirmar a exclusão." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      await authService.deleteManagedUser(id, admin.id, body.data.confirmEmail);
      return noStore(Response.json({ ok: true }));
    } catch (error) {
      return noStore(errorResponse(error));
    }
  }

  async createInvite(request: Request) {
    try {
      const admin = await requireRole("ADMIN", request.headers);
      const body = inviteSchema.safeParse(await jsonBody(request));
      if (!body.success)
        return Response.json(
          { message: "Informe um e-mail válido." },
          { status: 400 },
        );
      return Response.json(
        await authService.createInvitation(body.data.email, admin.id),
        { status: 201 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  async revokeInvite(request: Request, id: string) {
    try {
      await requireRole("ADMIN", request.headers);
      await authService.revokeInvitation(id);
      return Response.json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async revokePasswordReset(request: Request, id: string) {
    try {
      await requireRole("ADMIN", request.headers);
      await authService.revokePasswordReset(id);
      return Response.json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async activateInvite(request: Request) {
    try {
      const body = activateSchema.safeParse(await jsonBody(request));
      if (!body.success)
        return Response.json(
          { message: "Confira os dados e tente novamente." },
          { status: 400 },
        );
      await authService.activateInvitation(
        body.data.token,
        body.data.name,
        body.data.password,
        body.data.acceptTerms,
        body.data.termsVersion,
      );
      return noStore(Response.json({ ok: true }));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async createPasswordReset(request: Request) {
    try {
      const admin = await requireRole("ADMIN", request.headers);
      const body = resetIssueSchema.safeParse(await jsonBody(request));
      if (!body.success)
        return Response.json(
          { message: "Informe um e-mail válido." },
          { status: 400 },
        );
      return Response.json(
        await authService.createPasswordReset(body.data.email, admin.id),
        { status: 201 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  async resetPassword(request: Request) {
    try {
      const body = resetSchema.safeParse(await jsonBody(request));
      if (!body.success)
        return Response.json(
          { message: "Confira os dados e tente novamente." },
          { status: 400 },
        );
      await authService.resetPassword(body.data.token, body.data.password);
      return Response.json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async login(request: Request) {
    const body = await jsonBody(request);
    const parsed = z
      .object({
        email: z.string().trim().email().toLowerCase(),
        password: z.string().min(1),
      })
      .safeParse(body);
    if (!parsed.success)
      return Response.json(
        { message: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    const credentials = {
      email: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
    };
    try {
      const { auth } = await import("@/infrastructure/auth/auth");
      let retryAfter: number | null;
      try {
        retryAfter = await authService.checkLoginRateLimit(
          request,
          credentials.email,
        );
      } catch {
        return Response.json(
          { message: "O login está temporariamente indisponível." },
          { status: 503 },
        );
      }
      if (retryAfter !== null) {
        return Response.json(
          { message: "Muitas tentativas. Aguarde antes de tentar novamente." },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
      }
      if (!(await authService.canAttemptLogin(credentials.email))) {
        return Response.json(
          { message: "E-mail ou senha incorretos." },
          { status: 401 },
        );
      }
      const response = await auth.api.signInEmail({
        body: credentials,
        headers: request.headers,
        asResponse: true,
      });
      if (response.ok) {
        if (!(await authService.recordSuccessfulLogin(credentials.email))) {
          return Response.json(
            { message: "E-mail ou senha incorretos." },
            { status: 401 },
          );
        }
        return response;
      }
      if (response.status === 429)
        return Response.json(
          { message: "Muitas tentativas. Aguarde antes de tentar novamente." },
          {
            status: 429,
            headers: {
              "Retry-After": response.headers.get("Retry-After") ?? "60",
            },
          },
        );
      return Response.json(
        { message: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    } catch (error) {
      logger.error("auth.login.failed", { errorType: errorType(error) });
      return Response.json(
        { message: "Não foi possível concluir o login." },
        { status: 500 },
      );
    }
  }
}

export const authController = new AuthController();
