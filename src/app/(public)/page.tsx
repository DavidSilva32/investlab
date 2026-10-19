import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/app/(public)/_components/landing-page";
import { getAuthenticatedUser } from "@/infrastructure/auth/authorization";

export const dynamic = "force-dynamic";

export default async function PublicHomePage() {
  const user = await getAuthenticatedUser(await headers());
  if (user) redirect("/dashboard");

  return <LandingPage />;
}
