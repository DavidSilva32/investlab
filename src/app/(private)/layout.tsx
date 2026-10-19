import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";
import { ShellUserProvider } from "@/components/app-shell";
import { privacyCenterService } from "@/backend/services/privacy-center.service";
import { getCurrentTermsVersion } from "@/lib/privacy-policy";
import { TermsAcceptanceGate } from "@/app/(private)/_components/terms-acceptance-gate";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await getAuthenticatedUser(await headers());
  if (!user) redirect("/entrar");
  const termsVersion = getCurrentTermsVersion();
  const hasAcceptedCurrentTerms =
    await privacyCenterService.hasAcceptedCurrentTerms(user.id);

  return (
    <ShellUserProvider
      user={{
        name: user.name ?? "",
        email: user.email,
        role: user.role === "ADMIN" ? "ADMIN" : "USER",
      }}
    >
      {hasAcceptedCurrentTerms ? (
        children
      ) : (
        <TermsAcceptanceGate version={termsVersion} />
      )}
    </ShellUserProvider>
  );
}
