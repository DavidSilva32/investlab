import { headers } from "next/headers";
import { ApplicationError } from "@/backend/errors/application-error";
import type { AuthUser } from "@/infrastructure/auth/auth";

export async function getAuthenticatedUser(
  requestHeaders?: Headers,
): Promise<AuthUser | null> {
  const { auth } = await import("@/infrastructure/auth/auth");
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  return session?.user ?? null;
}

export async function requireAuthenticatedUser(
  requestHeaders?: Headers,
): Promise<AuthUser> {
  const user = await getAuthenticatedUser(requestHeaders);
  if (!user) throw new ApplicationError("Não autenticado.", 401);
  return user;
}

export async function requireRole(
  role: "USER" | "ADMIN",
  requestHeaders?: Headers,
): Promise<AuthUser> {
  const user = await requireAuthenticatedUser(requestHeaders);
  if (user.role !== role && !(role === "USER" && user.role === "ADMIN")) {
    throw new ApplicationError("Acesso não autorizado.", 403);
  }
  return user;
}
