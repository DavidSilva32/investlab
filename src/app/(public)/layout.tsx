import { headers } from "next/headers";
import { PublicSiteLayout } from "@/app/(public)/_components/public-site-layout";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";

export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let authenticated = false;
  try {
    authenticated = (await getAuthenticatedUser(await headers())) !== null;
  } catch {
    // Public documents remain available when session lookup is temporarily unavailable.
  }

  return (
    <PublicSiteLayout authenticated={authenticated}>
      {children}
    </PublicSiteLayout>
  );
}
