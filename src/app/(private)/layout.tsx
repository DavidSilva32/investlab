import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { ShellUserProvider } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/entrar");

  return (
    <ShellUserProvider
      user={{
        name: user.name ?? "",
        email: user.email,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
      }}
    >
      {children}
    </ShellUserProvider>
  );
}
