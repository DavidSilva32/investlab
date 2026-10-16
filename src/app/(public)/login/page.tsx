import { LoginForm } from "@/app/(public)/login/_components/login-form";
import { getSupportWhatsAppUrl } from "@/lib/support-whatsapp";

export default function LoginPage() {
  return (
    <LoginForm
      supportWhatsAppUrl={getSupportWhatsAppUrl(
        process.env.SUPPORT_WHATSAPP_NUMBER,
      )}
    />
  );
}
