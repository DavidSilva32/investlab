import { NextResponse, type NextRequest } from "next/server";
import { getApiRequestId } from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";
import {
  sessionCookieName,
  verifySession,
} from "@/infrastructure/auth/session";

const publicPaths = new Set(["/login", "/api/auth/login"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = await verifySession(
    request.cookies.get(sessionCookieName)?.value,
  );

  if (authenticated && pathname === "/login") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (authenticated || publicPaths.has(pathname)) return NextResponse.next();
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
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
