import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/entrar");
  if (user.role !== "ADMIN") redirect("/");

  return children;
}
