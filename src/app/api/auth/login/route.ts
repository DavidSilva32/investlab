import {
  createSession,
  sessionCookieName,
} from "@/infrastructure/auth/session";
import { credentialsService } from "@/infrastructure/auth/credentials.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !(await credentialsService.verify(email, password))
  )
    return Response.json(
      { message: "E-mail ou senha inválidos." },
      { status: 401 },
    );
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${sessionCookieName}=${await createSession(email)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`,
  );
  return response;
}
