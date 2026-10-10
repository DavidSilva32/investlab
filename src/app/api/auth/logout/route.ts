import { withApiRequestLogging } from "@/infrastructure/logging/api-request";
import { sessionCookieName } from "@/infrastructure/auth/session";

export const POST = withApiRequestLogging(
  "POST",
  "/api/auth/logout",
  async function POST() {
    const response = Response.json({ ok: true });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    response.headers.append(
      "Set-Cookie",
      `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    );

    return response;
  },
);
