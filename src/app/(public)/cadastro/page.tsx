import { PublicSignupForm } from "@/app/(public)/cadastro/_components/public-signup-form";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";

export default function PublicSignupPage() {
  return <PublicSignupForm termsVersion={CURRENT_TERMS_VERSION} />;
}
