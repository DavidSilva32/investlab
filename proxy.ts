import { NextResponse, type NextRequest } from "next/server";
import {
  sessionCookieName,
  verifySession,
} from "@/infrastructure/auth/session";

const publicPaths = new Set([
  "/login",
  "/api/auth/login",
  "/api/screener/sync",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = await verifySession(
    request.cookies.get(sessionCookieName)?.value,
  );
  if (authenticated && pathname === "/login")
    return NextResponse.redirect(new URL("/", request.url));
  if (authenticated || publicPaths.has(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/"))
    return Response.json({ message: "Não autenticado." }, { status: 401 });
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
