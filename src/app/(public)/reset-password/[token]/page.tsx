import { CredentialSetupForm } from "@/components/auth/credential-setup-form";

export default async function PasswordResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CredentialSetupForm mode="reset" token={token} />;
}
