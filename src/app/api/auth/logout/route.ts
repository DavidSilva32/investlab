import { sessionCookieName } from "@/infrastructure/auth/session";

export async function POST() {
  const response = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  response.headers.append(
    "Set-Cookie",
    `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );

  return response;
}
