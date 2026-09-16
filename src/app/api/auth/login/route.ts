import { z } from "zod";

import { credentialsService } from "@/infrastructure/auth/credentials.service";
import {
  createSession,
  sessionCookieName,
} from "@/infrastructure/auth/session";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

const emailSchema = z.email();

function invalidEmailResponse() {
  return Response.json(
    { message: "Informe um e-mail válido." },
    { status: 400 },
  );
}

function invalidCredentialsResponse() {
  return Response.json(
    { message: "E-mail ou senha incorretos." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidEmailResponse();
  }

  if (typeof body !== "object" || body === null) return invalidEmailResponse();

  const { email: receivedEmail, password } = body as {
    email?: unknown;
    password?: unknown;
  };
  const email = emailSchema.safeParse(receivedEmail);

  if (!email.success) return invalidEmailResponse();
  if (typeof password !== "string") return invalidCredentialsResponse();

  try {
    if (!(await credentialsService.verify(email.data, password))) {
      return invalidCredentialsResponse();
    }

    const response = Response.json({ ok: true });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    response.headers.append(
      "Set-Cookie",
      `${sessionCookieName}=${await createSession(email.data)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`,
    );

    return response;
  } catch (error) {
    logger.error("auth_login_failed", { error });

    return Response.json(
      { message: "Não foi possível concluir o login." },
      { status: 500 },
    );
  }
}
