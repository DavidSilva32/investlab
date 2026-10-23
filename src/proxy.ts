import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getApiRequestId } from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

const publicPaths = new Set([
  "/",
  "/apresentacao",
  "/demonstracao",
  "/cadastro",
  "/entrar",
  "/login",
  "/termos-de-uso",
  "/privacidade",
  "/cookies",
  "/mcp",
  "/mcp/consent",
  "/api/auth/login",
  "/api/auth/public-signup",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/invitations/activate",
  "/api/auth/password-resets/consume",
  "/api/webhooks/asaas",
  "/api/cron/weekly-screener-sync/fundamentals",
  "/api/cron/weekly-screener-sync/market",
]);

function isPublicPath(pathname: string) {
  return (
    publicPaths.has(pathname) ||
    pathname.startsWith("/api/auth/oauth2/") ||
    pathname.startsWith("/api/auth/.well-known/") ||
    pathname === "/api/auth/jwks" ||
    pathname.startsWith("/.well-known/oauth-") ||
    pathname === "/api/mcp" ||
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/redefinir-senha/") ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/access-unavailable"
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = Boolean(getSessionCookie(request));

  if (authenticated || isPublicPath(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    const requestId = getApiRequestId(request);
    logger.withContext({ requestId }, () =>
      logger.warn("api_request_rejected", {
        method: request.method,
        route: pathname,
        reason: "unauthenticated",
      }),
    );
    const response = Response.json(
      { message: "Não autenticado." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
    response.headers.set("x-request-id", requestId);
    return response;
  }
  const response = NextResponse.redirect(new URL("/entrar", request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|brands/).*)"],
};
