import { CredentialSetupForm } from "@/components/auth/credential-setup-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CredentialSetupForm mode="invite" token={token} />;
}
