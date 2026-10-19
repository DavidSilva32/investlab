export const DRAFT_TERMS_VERSION = "rascunho-2026-10-17.1";
export const COOKIE_POLICY_VERSION = "rascunho-2026-10-19.1";
// This remains null until the public Terms are approved and updated in the same change.
export const APPROVED_TERMS_VERSION: string | null = null;
export const PRIVACY_DOCUMENT_DATE = "17 de outubro de 2026";

export function validateApprovedTermsVersion(
  configuredVersion: string | null,
): string | null {
  const version = configuredVersion?.trim();
  if (
    !version ||
    version === DRAFT_TERMS_VERSION ||
    !/^[a-zA-Z0-9._-]{1,40}$/.test(version)
  ) {
    return null;
  }
  return version;
}

export function getApprovedTermsVersion(): string | null {
  return validateApprovedTermsVersion(APPROVED_TERMS_VERSION);
}

export const PRIVACY_DOCUMENT_REVIEW_STATUS =
  "Em preparação. Revisão jurídica e confirmação institucional pendentes.";
