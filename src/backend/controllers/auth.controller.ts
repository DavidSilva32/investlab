import { z } from "zod";
import { authService } from "@/backend/services/auth.service";
import { ApplicationError } from "@/backend/errors/application-error";
import { requireRole } from "@/infrastructure/auth/authorization";

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

const inviteSchema = z.object({ email: z.email() });
const activateSchema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(128),
});
const resetIssueSchema = z.object({ email: z.email() });
const resetSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12).max(128),
});

export class AuthController {
  async adminData(request: Request) {
    try {
      await requireRole("ADMIN", request.headers);
      return Response.json(await authService.listAdministrationData());
    } catch (error) {
      return errorResponse(error);
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
      );
      return Response.json({ ok: true });
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

  async legacyLogin(request: Request) {
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
      let response = await auth.api.signInEmail({
        body: credentials,
        headers: request.headers,
        asResponse: true,
      });
      let isLegacyCredential = false;
      try {
        const { credentialsService } =
          await import("@/infrastructure/auth/credentials.service");
        const { getCredentialsConfiguration } =
          await import("@/infrastructure/auth/auth-configuration");
        const legacy = getCredentialsConfiguration();
        isLegacyCredential =
          credentials.email === legacy.email.trim().toLowerCase() &&
          (await credentialsService.verify(
            credentials.email,
            credentials.password,
          ));
      } catch {
        /* Legacy bootstrap is optional after the transition. */
      }
      if (!response.ok && response.status === 401 && isLegacyCredential) {
        try {
          if (
            await authService.bootstrapLegacyAdministrator(
              credentials.email,
              credentials.password,
            )
          ) {
            response = await auth.api.signInEmail({
              body: credentials,
              headers: request.headers,
              asResponse: true,
            });
          }
        } catch {
          /* Generic response prevents account enumeration. */
        }
      } else if (response.ok && isLegacyCredential) {
        // Recover the rare case where sign-up committed but role promotion
        // failed in the previous request.
        try {
          await authService.bootstrapLegacyAdministrator(
            credentials.email,
            credentials.password,
          );
        } catch {
          /* Keep the valid sign-in; the next legacy sign-in retries promotion. */
        }
      }
      if (response.ok) return response;
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
    } catch {
      return Response.json(
        { message: "Não foi possível concluir o login." },
        { status: 500 },
      );
    }
  }
}

export const authController = new AuthController();
