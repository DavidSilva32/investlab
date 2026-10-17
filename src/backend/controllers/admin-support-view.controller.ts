import { z } from "zod";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  ADMIN_SUPPORT_VIEW_COOKIE,
  ADMIN_SUPPORT_VIEW_DURATION_MS,
  adminSupportViewService,
  readAdminSupportViewToken,
} from "@/backend/services/admin-support-view.service";
import { requireRole } from "@/infrastructure/auth/authorization";

const startSchema = z
  .object({ targetUserId: z.string().trim().min(1).max(128) })
  .strict();

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function cookieOptions() {
  return [
    `${ADMIN_SUPPORT_VIEW_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}

function setSupportCookie(response: Response, token: string) {
  response.headers.append(
    "Set-Cookie",
    [
      `${ADMIN_SUPPORT_VIEW_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(ADMIN_SUPPORT_VIEW_DURATION_MS / 1000)}`,
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; "),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clearSupportCookie(response: Response) {
  response.headers.append("Set-Cookie", cookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export class AdminSupportViewController {
  async get(request: Request) {
    try {
      const actor = await requireRole("ADMIN", request.headers);
      const token = readAdminSupportViewToken(request.headers);
      const active = await adminSupportViewService.getActive(token, actor.id);
      const targets = await adminSupportViewService.listTargets(
        request.headers,
      );
      const response = Response.json({
        targets,
        supportView: active
          ? {
              target: {
                id: active.targetUserId,
                name: active.targetName,
                email: active.targetEmail,
              },
              expiresAt: active.expiresAt.toISOString(),
            }
          : null,
      });
      return token && !active
        ? clearSupportCookie(response)
        : noStore(response);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async start(request: Request) {
    try {
      await requireRole("ADMIN", request.headers);
      if (!isSameOrigin(request))
        throw new ApplicationError("Requisição não autorizada.", 403);
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        throw new ApplicationError("Selecione uma conta válida.", 400);
      }
      const body = startSchema.safeParse(input);
      if (!body.success)
        throw new ApplicationError("Selecione uma conta válida.", 400);
      const result = await adminSupportViewService.start(
        body.data.targetUserId,
        request.headers,
      );
      const response = Response.json({
        supportView: {
          target: result.target,
          expiresAt: result.expiresAt.toISOString(),
        },
      });
      return setSupportCookie(response, result.token);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  async end(request: Request) {
    try {
      await requireRole("ADMIN", request.headers);
      if (!isSameOrigin(request))
        throw new ApplicationError("Requisição não autorizada.", 403);
      return clearSupportCookie(Response.json({ supportView: null }));
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  private errorResponse(error: unknown) {
    return noStore(
      error instanceof ApplicationError
        ? Response.json(
            { message: error.message },
            { status: error.statusCode },
          )
        : Response.json(
            { message: "Não foi possível atualizar o modo de suporte." },
            { status: 500 },
          ),
    );
  }
}

export const adminSupportViewController = new AdminSupportViewController();
