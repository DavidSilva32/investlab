import { CredentialSetupForm } from "@/components/auth/credential-setup-form";
import { getCurrentTermsVersion } from "@/lib/privacy-policy";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <CredentialSetupForm
      mode="invite"
      token={token}
      termsVersion={getCurrentTermsVersion()}
    />
  );
}
