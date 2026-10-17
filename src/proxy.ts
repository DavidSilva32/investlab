import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getApiRequestId } from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

const publicPaths = new Set([
  "/entrar",
  "/entrar",
  "/termos-de-uso",
  "/privacidade",
  "/cookies",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/invitations/activate",
  "/api/auth/password-resets/consume",
  "/api/cron/weekly-screener-sync/fundamentals",
  "/api/cron/weekly-screener-sync/market",
]);

function isPublicPath(pathname: string) {
  return (
    publicPaths.has(pathname) ||
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/redefinir-senha/") ||
    pathname.startsWith("/redefinir-senha/") ||
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
