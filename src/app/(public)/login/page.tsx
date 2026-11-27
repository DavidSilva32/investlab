import { LoginForm } from "@/app/(public)/login/_components/login-form";
import { getSupportWhatsAppUrl } from "@/lib/support-whatsapp";
import { getMcpLoginCallback } from "@/lib/mcp/oauth-login-callback";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackURL = getMcpLoginCallback(params.callbackURL);

  return (
    <LoginForm
      mcpCallbackURL={callbackURL}
      supportWhatsAppUrl={getSupportWhatsAppUrl(
        process.env.SUPPORT_WHATSAPP_NUMBER,
      )}
    />
  );
}
