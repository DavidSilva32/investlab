import { LegalDocumentPage } from "@/app/(public)/_components/legal-document-page";
import { CURRENT_TERMS_VERSION } from "@/lib/privacy-policy";
import { TERMS_OF_USE_SECTIONS } from "@/lib/terms-of-use";

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Termos de Uso"
      introduction="Leia as condições de acesso e uso do InvestLab. O aceite desta versão é registrado na sua conta e não altera suas preferências de cookies."
      sections={TERMS_OF_USE_SECTIONS}
      statusLabel={`Versão vigente do produto · ${CURRENT_TERMS_VERSION}`}
      updatedAt="22 de outubro de 2026"
    />
  );
}
